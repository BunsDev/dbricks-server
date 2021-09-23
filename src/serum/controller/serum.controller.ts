import e from 'express';
import debug from 'debug';
import {serializeIxsAndSigners} from 'dbricks-lib';
import SerumOrderService from '../services/serum.service.order';
import SerumMarketService from '../services/serum.service.market';
import {
  deserializeCancelOrder,
  deserializeInitMarket,
  deserializePlaceOrder,
  deserializeSettleMarket
} from "./serum.controller.serializers";

const log: debug.IDebugger = debug('app:serum-controller');

class SerumController {
  // --------------------------------------- order

  async placeOrder(req: e.Request, res: e.Response) {
    const params = deserializePlaceOrder(req);
    const serumOrderService = new SerumOrderService();
    const ixsAndSigners = await serumOrderService.place(params);
    log('Order instruction/signers generated');
    res.status(200).send(serializeIxsAndSigners(ixsAndSigners));
  }

  async cancelOrder(req: e.Request, res: e.Response) {
    const params = deserializeCancelOrder(req);
    const serumOrderService = new SerumOrderService();
    const ixsAndSigners = await serumOrderService.cancel(params);
    log(`Order ${params.orderId} successfully cancelled`);
    res.status(200).send(serializeIxsAndSigners(ixsAndSigners));
  }

  // --------------------------------------- market

  async initMarket(req: e.Request, res: e.Response) {
    const params = deserializeInitMarket(req);
    const serumMarketService = new SerumMarketService();
    const ixsAndSigners = await serumMarketService.init(params);
    log(`Market for ${params.baseMintPk}/${params.quoteMintPk} successfully initialized`);
    res.status(200).send(serializeIxsAndSigners(ixsAndSigners));
  }

  async settleMarket(req: e.Request, res: e.Response) {
    const params = deserializeSettleMarket(req);
    const serumMarketService = new SerumMarketService();
    const ixsAndSigners = await serumMarketService.settle(params);
    log('Settle instruction/signers generated');
    res.status(200).send(serializeIxsAndSigners(ixsAndSigners));
  }

  async getMarketMints(req: e.Request, res: e.Response) {
    const serumMarketService = new SerumMarketService();
    const [base, quote] = await serumMarketService.getMarketMints(req.body.marketPk);
    log('Base/quote names generated');
    res.status(200).send([base, quote]);
  }
}

export default new SerumController();

