import { PublicKey } from '@solana/web3.js';
import { ixsAndSigners } from 'dbricks-lib';
import {
  ILenderDeposit,
} from '../../common/interfaces/lender/common.interfaces.lender.deposit';
import MangoClient from '../client/mango.client';

export default class MangoDepositService extends MangoClient implements ILenderDeposit {
  async deposit(
    mintPk: PublicKey,
    quantity: number,
    ownerPk: PublicKey,
    destinationPk?: PublicKey,
  ): Promise<ixsAndSigners[]> {
    const mangoInformation = await this.loadAllAccounts(ownerPk, mintPk);
    const {
      userAccs, tokenAccPk, rootBank, nodeBank, vault,
    } = mangoInformation;

    if (userAccs.length === 0) {
      const tx = await this.prepDepositTx(
        ownerPk,
        rootBank,
        nodeBank,
        vault,
        tokenAccPk,
        quantity,
      );
      return [tx];
    }

    if (!destinationPk) {
      throw new Error('Destination account for deposit not specified');
    }
    const mangoAcc = userAccs.find(
      (acc) => acc.publicKey.toBase58() === destinationPk.toBase58(),
    );
    if (!mangoAcc) {
      throw new Error(
        `${destinationPk.toBase58()} is not owned by ${ownerPk.toBase58()}`,
      );
    }

    const tx = await this.prepDepositTx(
      ownerPk,
      rootBank,
      nodeBank,
      vault,
      tokenAccPk,
      quantity,
      mangoAcc.publicKey,
    );
    return [tx];
  }
}
