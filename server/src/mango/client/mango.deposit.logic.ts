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
import { ixAndSigners } from '../../common/interfaces/lender/common.interfaces.lender.deposit';
import { MANGO_PROG_ID } from '../../config/config';

const log: debug.IDebugger = debug('app:mango-deposit-logic');

export async function getDepositTxn(
  mangoAccount: MangoAccount,
  mangoGroup: MangoGroup,
  ownerPk: PublicKey,
  rootBank: PublicKey,
  nodeBank: PublicKey,
  vault: PublicKey,
  tokenAcc: TokenAccount,
  quantity: number,
): Promise<ixAndSigners> {
  // TODO: if no already exisiting Mango account, will need init and deposit instructions
  const transactionIx = [];
  const additionalSigners: Array<Keypair> = [];
  const tokenIndex = mangoGroup.getTokenIndex(tokenAcc.mint);
  const tokenMint = mangoGroup.tokens[tokenIndex].mint;

  let wrappedSolAccount: Keypair | null = null;
  if (
    tokenMint.equals(WRAPPED_SOL_MINT)
        && tokenAcc.publicKey.toBase58() === ownerPk.toBase58()
  ) {
    wrappedSolAccount = new Keypair();
    const lamports = Math.round(quantity * LAMPORTS_PER_SOL) + 1e7;
    transactionIx.push(
      SystemProgram.createAccount({
        fromPubkey: ownerPk,
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
        owner: ownerPk,
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
    ownerPk,
    mangoGroup.mangoCache,
    mangoAccount.publicKey,
    rootBank,
    nodeBank,
    vault,
    wrappedSolAccount?.publicKey ?? tokenAcc.publicKey,
    nativeQuantity,
  );

  transactionIx.push(instruction);

  if (wrappedSolAccount) {
    transactionIx.push(
      closeAccount({
        source: wrappedSolAccount.publicKey,
        destination: ownerPk,
        owner: ownerPk,
      }),
    );
  }

  return [transactionIx, additionalSigners];
}
