import {
  IDEXOrder,
  IDEXOrderCancelParsed,
  IDEXOrderPlaceParsed,
} from '../../common/interfaces/dex/common.interfaces.dex.order';
import SerumClient from '../client/serum.client';
import {mergeIxsAndSigners} from "../../common/util/common.util";
import {ixsAndSigners} from "dbricks-lib";

export default class SerumOrderService extends SerumClient implements IDEXOrder {
  async place(params: IDEXOrderPlaceParsed): Promise<ixsAndSigners[]> {
    const market = await this.loadSerumMarket(params.marketPk);
    const [payerIxsAndSigners, payerPk] = await this.getPayerForMarket(
      market,
      params.side,
      params.ownerPk,
    );
    const placeIxsAndSigners = await this.prepPlaceOrderTx(
      market,
      params.side,
      params.price,
      params.size,
      params.orderType,
      params.ownerPk,
      payerPk,
    );
    const tx = mergeIxsAndSigners(payerIxsAndSigners, placeIxsAndSigners);
    return [tx];
  }

  async cancel(params:IDEXOrderCancelParsed): Promise<ixsAndSigners[]> {
    const market = await this.loadSerumMarket(params.marketPk);
    const ixAndSigners = await this.prepCancelOrderTx(
      market,
      params.ownerPk,
      params.orderId,
    );
    return [ixAndSigners]
  }
}
