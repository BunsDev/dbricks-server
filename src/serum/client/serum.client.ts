import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram, Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import BN from 'bn.js';
import {DexInstructions, Market, TokenInstructions} from '@project-serum/serum';
import debug from 'debug';
import {Order} from '@project-serum/serum/lib/market';
import {
  instructionsAndSigners,
  orderType,
  side,
} from 'dbricks-lib';
import SolClient from '../../common/client/common.client';
import {SERUM_PROG_ID} from '../../config/config';
import {tryGetSerumMarketName} from "../../common/util/common.util";

const log: debug.IDebugger = debug('app:serum-client');

export default class SerumClient extends SolClient {
  constructor() {
    super();
    log('Initialized Serum client');
  }

  async prepareInitMarketTransaction(
    marketPubkey: PublicKey,
    requestQueuePubkey: PublicKey,
    eventQueuePubkey: PublicKey,
    bidsPubkey: PublicKey,
    asksPubkey: PublicKey,
    baseVaultPubkey: PublicKey,
    quoteVaultPubkey: PublicKey,
    baseMintPubkey: PublicKey,
    quoteMintPubkey: PublicKey,
    baseLotSize: BN,
    quoteLotSize: BN,
    feeRateBps: BN,
    vaultNonce: BN,
    quoteDustThreshold: BN,
  ): Promise<instructionsAndSigners> {
    const initMarketInstruction = DexInstructions.initializeMarket({
      // dex accounts
      market: marketPubkey,
      requestQueue: requestQueuePubkey,
      eventQueue: eventQueuePubkey,
      bids: bidsPubkey,
      asks: asksPubkey,
      // vaults
      baseVault: baseVaultPubkey,
      quoteVault: quoteVaultPubkey,
      // mints
      baseMint: baseMintPubkey,
      quoteMint: quoteMintPubkey,
      // rest
      baseLotSize,
      quoteLotSize,
      feeRateBps,
      vaultSignerNonce: vaultNonce,
      quoteDustThreshold,
      programId: SERUM_PROG_ID,
      // todo add
      // authority = undefined,
      // pruneAuthority = undefined,
    });
    return {
      instructions: [initMarketInstruction],
      signers: [],
    };
  }

  async preparePlaceOrderTransaction(
    market: Market,
    side: side,
    price: number,
    size: number,
    orderType: orderType,
    ownerPubkey: PublicKey,
    payerPubkey: PublicKey,
  ): Promise<instructionsAndSigners> {
    const placeOrderTransaction = await market.makePlaceOrderTransaction(this.connection, {
      owner: ownerPubkey,
      payer: payerPubkey,
      side,
      price,
      size,
      orderType,
      feeDiscountPubkey: null, // needed to enable devnet/localnet
    });
    return {
      instructions: [...placeOrderTransaction.transaction.instructions],
      signers: [...placeOrderTransaction.signers],
    }
  }

  async prepareCancelOrderTransaction(
    market: Market,
    ownerPubkey: PublicKey,
    orderId?: BN,
  ): Promise<instructionsAndSigners> {
    let orders;
    //fail to load
    try {
      orders = await market.loadOrdersForOwner(
        this.connection,
        ownerPubkey,
      );
    } catch (e) {
      log('failed to load open orders', e);
      return {instructions: [], signers: []};
    }
    //none returned
    if (orders.length === 0) {
      return {instructions: [], signers: []};
    }
    //if specific order id passed
    if (orderId) {
      const [order] = orders.filter((o: Order) => {
        if (o.orderId.eq(orderId)) {
          return o;
        }
      });
      if (!order) {
        log(`order with id ${orderId} not found`)
        return {instructions: [], signers: []};
      }
      const cancelOrderTransaction = await market.makeCancelOrderTransaction(
        this.connection,
        ownerPubkey,
        order,
      );
      return {
        instructions: [...cancelOrderTransaction.instructions],
        signers: [],
      }
    }
    //else just cancel all
    const instructions: TransactionInstruction[] = [];
    orders.forEach(async (o) => {
      const cancelOrderTransaction = await market.makeCancelOrderTransaction(
        this.connection,
        ownerPubkey,
        o,
      );
      instructions.push(...cancelOrderTransaction.instructions)
    })
    return {
      instructions,
      signers: [],
    }
  }

  async prepareSettleFundsTransaction(
    market: Market,
    ownerPubkey: PublicKey,
    ownerBasePubkey: PublicKey,
    ownerQuotePubkey: PublicKey,
  ): Promise<instructionsAndSigners> {
    // currently this will fail if this is the first ever trade for this user in this market
    // this means the 1st trade won't settle and we have to run this twice to actually settle it
    const openOrdersAccounts = await market.findOpenOrdersAccountsForOwner(
      this.connection, ownerPubkey,
    );
    if (openOrdersAccounts.length === 0) {
      return {instructions: [], signers: []};
    }
    const settleFundsTransaction = await market.makeSettleFundsTransaction(
      this.connection,
      openOrdersAccounts[0],
      ownerBasePubkey,
      ownerQuotePubkey,
    );
    return {
      instructions: [...settleFundsTransaction.transaction.instructions],
      signers: [...settleFundsTransaction.signers],
    }
  }

  async getMarketMintsFromMarketPubkey(marketPubkey: string): Promise<[string, string]> {
    const marketName = tryGetSerumMarketName(marketPubkey);
    if (marketName) {
      return marketName.split('/') as [string, string];
    }
    try {
      const market = await this.loadSerumMarket(new PublicKey(marketPubkey));
      return [
        market.baseMintAddress.toBase58(),
        market.quoteMintAddress.toBase58()
      ];
    } catch (e) {
      //todo need better err handling
      return ['X', 'Y'];
    }
  }

  // --------------------------------------- helpers (passive)

  async getPayerForMarket(
    market: Market,
    side: side,
    ownerPubkey: PublicKey,
  ): Promise<[instructionsAndSigners, PublicKey]> {
    if (side === 'buy') {
      return this.getOrCreateTokenAccountByMint(
        ownerPubkey, market.quoteMintAddress,
      );
    } else {
      return this.getOrCreateTokenAccountByMint(
        ownerPubkey, market.baseMintAddress,
      );
    }
  }

  async getBaseAndQuoteAccountsFromMarket(
    market: Market,
    ownerPubkey: PublicKey,
  ): Promise<[instructionsAndSigners, PublicKey][]> {
    const [ownerBaseInstructionsAndSigners, ownerBasePubkey] = await this.getOrCreateTokenAccountByMint(
      ownerPubkey, market.baseMintAddress,
    );
    const [ownerQuoteInstructionsAndSigners, ownerQuotePubkey] = await this.getOrCreateTokenAccountByMint(
      ownerPubkey, market.quoteMintAddress,
    );
    return [
      [ownerBaseInstructionsAndSigners, ownerBasePubkey],
      [ownerQuoteInstructionsAndSigners, ownerQuotePubkey],
    ];
  }

  async loadSerumMarket(
    marketPubkey: PublicKey,
  ): Promise<Market> {
    return Market.load(this.connection, marketPubkey, {}, SERUM_PROG_ID);
  }

  async loadOrdersForOwner(
    market: Market,
    ownerPubkey: PublicKey,
  ): Promise<Order[]> {
    return market.loadOrdersForOwner(
      this.connection,
      ownerPubkey,
    );
  }

  async calcBaseAndQuoteLotSizes(
    lotSize: number,
    tickSize: number,
    baseMintPubkey: PublicKey,
    quoteMintPubkey: PublicKey,
  ): Promise<[BN, BN]> {
    let baseLotSize;
    let quoteLotSize;

    const baseMintInfo = await this.deserializeTokenMint(baseMintPubkey);
    const quoteMintInfo = await this.deserializeTokenMint(quoteMintPubkey);

    if (baseMintInfo && lotSize > 0) {
      baseLotSize = Math.round(10 ** baseMintInfo.decimals * lotSize);
      if (quoteMintInfo && tickSize > 0) {
        quoteLotSize = Math.round(lotSize * 10 ** quoteMintInfo.decimals * tickSize);
      }
    }
    if (!baseLotSize || !quoteLotSize) {
      throw new Error(`Failed to calculate base/quote lot sizes from lot size ${lotSize} and tick size ${tickSize}`);
    }

    return [new BN(baseLotSize), new BN(quoteLotSize)];
  }

  // --------------------------------------- helpers (active)

  async prepareCreateStateAccountsInstruction(
    stateAccountPubkey: PublicKey,
    space: number,
    ownerPubkey: PublicKey,
  ): Promise<TransactionInstruction> {
    return SystemProgram.createAccount({
      programId: SERUM_PROG_ID,
      fromPubkey: ownerPubkey,
      newAccountPubkey: stateAccountPubkey,
      space,
      lamports: await this.connection.getMinimumBalanceForRentExemption(space),
    });
  }

  async prepareStateAccountsForNewMarket(
    ownerPubkey: PublicKey, // wallet owner
  ): Promise<instructionsAndSigners> {
    // do we just throw these away? seems to be the case in their Serum DEX UI
    // https://github.com/project-serum/serum-dex-ui/blob/master/src/utils/send.tsx#L475
    const marketKeypair = new Keypair();
    const requestQueueKeypair = new Keypair();
    const eventQueueKeypair = new Keypair();
    const bidsKeypair = new Keypair();
    const asksKeypair = new Keypair();

    // length taken from here - https://github.com/project-serum/serum-dex/blob/master/dex/crank/src/lib.rs#L1286
    const marketInstruction = await this.prepareCreateStateAccountsInstruction(
      marketKeypair.publicKey, 376 + 12, ownerPubkey,
    );
    const requestQueueInstruction = await this.prepareCreateStateAccountsInstruction(
      requestQueueKeypair.publicKey, 640 + 12, ownerPubkey,
    );
    const eventQueueInstruction = await this.prepareCreateStateAccountsInstruction(
      eventQueueKeypair.publicKey, 1048576 + 12, ownerPubkey,
    );
    const bidsInstruction = await this.prepareCreateStateAccountsInstruction(
      bidsKeypair.publicKey, 65536 + 12, ownerPubkey,
    );
    const asksInstruction = await this.prepareCreateStateAccountsInstruction(
      asksKeypair.publicKey, 65536 + 12, ownerPubkey,
    );

    return {
      instructions: [marketInstruction, requestQueueInstruction, eventQueueInstruction, bidsInstruction, asksInstruction],
      signers: [marketKeypair, requestQueueKeypair, eventQueueKeypair, bidsKeypair, asksKeypair],
    }
  }

  async prepareVaultAccounts(
    vaultOwnerPubkey: PublicKey,
    baseMint: PublicKey,
    quoteMint: PublicKey,
    ownerPubkey: PublicKey, // wallet owner
  ): Promise<instructionsAndSigners> {
    const baseVaultKeypair = new Keypair();
    const quoteVaultKeypair = new Keypair();

    // as per https://github.com/project-serum/serum-dex-ui/blob/master/src/utils/send.tsx#L519
    const instructions = [
      SystemProgram.createAccount({
        fromPubkey: ownerPubkey,
        newAccountPubkey: baseVaultKeypair.publicKey,
        lamports: await this.connection.getMinimumBalanceForRentExemption(165),
        space: 165,
        programId: TokenInstructions.TOKEN_PROGRAM_ID,
      }),
      SystemProgram.createAccount({
        fromPubkey: ownerPubkey,
        newAccountPubkey: quoteVaultKeypair.publicKey,
        lamports: await this.connection.getMinimumBalanceForRentExemption(165),
        space: 165,
        programId: TokenInstructions.TOKEN_PROGRAM_ID,
      }),
      TokenInstructions.initializeAccount({
        account: baseVaultKeypair.publicKey,
        mint: baseMint,
        owner: vaultOwnerPubkey,
      }),
      TokenInstructions.initializeAccount({
        account: quoteVaultKeypair.publicKey,
        mint: quoteMint,
        owner: vaultOwnerPubkey,
      }),
    ];
    return {
      instructions,
      signers: [baseVaultKeypair, quoteVaultKeypair],
    }
  }

  // --------------------------------------- testing only

  async _consumeEvents(market: Market, ownerKeypair: Keypair) {
    const openOrders = await market.findOpenOrdersAccountsForOwner(
      this.connection,
      ownerKeypair.publicKey,
    );
    const consumeEventsInstruction = market.makeConsumeEventsInstruction(
      openOrders.map((oo) => oo.publicKey), 100,
    );
    await this._prepareAndSendTransaction({
      instructions: [consumeEventsInstruction],
      signers: [ownerKeypair],
    });
  }
}
