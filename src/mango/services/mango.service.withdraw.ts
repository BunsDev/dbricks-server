import { ixsAndSigners } from 'dbricks-lib';
import {
  IMangoLenderWithdraw,
  IMangoLenderWithdrawParamsParsed,
} from '../interfaces/lender/mango.interfaces.lender.withdraw';
import MangoClient from '../client/mango.client';
import { SERUM_PROG_ID } from '../../config/config';

export default class MangoWithdrawService extends MangoClient implements IMangoLenderWithdraw {
  async withdraw(params: IMangoLenderWithdrawParamsParsed): Promise<ixsAndSigners[]> {
    const bankVaultInfo = await this.loadBankVaultInformation(params.mintPk);
    const { rootBank, nodeBank, vault } = bankVaultInfo;
    const mangoAcc = await this.nativeClient.getMangoAccount(params.mangoAccPk, SERUM_PROG_ID);

    const tx = await this.prepWithdrawTx(
      mangoAcc,
      params.ownerPk,
      rootBank,
      nodeBank,
      vault,
      params.quantity,
      params.isBorrow,
    );
    return [tx];
  }
}
