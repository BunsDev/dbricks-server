import {
  makeDepositInstruction, MangoAccount, MangoGroup, TokenAccount, uiToNative,
} from '@blockworks-foundation/mango-client';
import {
  closeAccount, initializeAccount, TOKEN_PROGRAM_ID, WRAPPED_SOL_MINT,
} from '@project-serum/serum/lib/token-instructions';
import {
  Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram,
} from '@solana/web3.js';
import debug from 'debug';
import { ixAndSigners } from '../../common/interfaces/lender/lender.deposit.interface';
import { MANGO_PROG_ID } from '../../constants/constants';


const log: debug.IDebugger = debug('app:mango-deposit-logic');

export async function getDepositTxn(
  mangoAccount: MangoAccount,
  mangoGroup: MangoGroup,
  walletPk: PublicKey,
  tokenAcc: TokenAccount,
  quantity: number,
): Promise<ixAndSigners> { // TODO: if no already exisiting Mango account, will need init and deposit instructions
  // if (!mangoGroup) {
  //   return;
  // }
  // Check and get the right type of deposit from here
  const transactionIx = [];
  const additionalSigners: Array<Keypair> = [];
  const tokenIndex = mangoGroup.getTokenIndex(tokenAcc.mint);
  // const tokenIndex = mangoGroup.getRootBankIndex(rootBank);
  const tokenMint = mangoGroup.tokens[tokenIndex].mint;

  const rootbank = mangoGroup.tokens[tokenIndex].rootBank;
  const nodeBank = mangoGroup.rootBankAccounts[tokenIndex]?.nodeBankAccounts[0].publicKey;
  const vault = mangoGroup.rootBankAccounts[tokenIndex]?.nodeBankAccounts[0].vault;
  log(tokenMint);
  log(tokenIndex);
  log(nodeBank);
  log(vault);
  log(mangoGroup);
  // if (!nodeBank || !vault) {
  //   return;
  // }

  let wrappedSolAccount: Keypair | null = null;
  if (
    tokenMint.equals(WRAPPED_SOL_MINT)
        && tokenAcc.publicKey.toBase58() === walletPk.toBase58()
  ) {
    wrappedSolAccount = new Keypair();
    const lamports = Math.round(quantity * LAMPORTS_PER_SOL) + 1e7;
    transactionIx.push(
      SystemProgram.createAccount({
        fromPubkey: walletPk,
        newAccountPubkey: wrappedSolAccount.publicKey,
        lamports,
        space: 165,
        programId: TOKEN_PROGRAM_ID,
      }),
    );

    transactionIx.push(
      initializeAccount({
        account: wrappedSolAccount.publicKey,
        mint: WRAPPED_SOL_MINT,
        owner: walletPk,
      }),
    );

    additionalSigners.push(wrappedSolAccount);
  }

  const nativeQuantity = uiToNative(
    quantity,
    mangoGroup.tokens[tokenIndex].decimals,
  );

  const instruction = makeDepositInstruction(
    MANGO_PROG_ID,
    mangoGroup.publicKey,
    walletPk,
    mangoGroup.mangoCache,
    mangoAccount.publicKey,
    rootbank,
    nodeBank ?? new PublicKey('123'), // TODO: fix
    vault ?? new PublicKey('123'),
    wrappedSolAccount?.publicKey ?? tokenAcc.publicKey,
    nativeQuantity,
  );

  transactionIx.push(instruction);

  if (wrappedSolAccount) {
    transactionIx.push(
      closeAccount({
        source: wrappedSolAccount.publicKey,
        destination: walletPk,
        owner: walletPk,
      }),
    );
  }

  return [transactionIx, additionalSigners]; // might need OG signer too, walltPK keypair?
}
