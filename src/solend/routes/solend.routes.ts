import CommonRoutesConfig from "../../common/routes/common.routes.config";
import e from 'express';
import SolendMiddleware from '../middleware/solend.middleware';
import SolendController from '../controller/solend.controller';

export class SolendRoutes extends CommonRoutesConfig {
  constructor(app: e.Application) {
    super(app, 'SolendRoutes');
  }

  configureRoutes(): e.Application {
    this.app.route('/solend/deposit')
      .post(
        SolendMiddleware.validateStuff,
        SolendController.deposit
      )

    this.app.route('/solend/withdraw')
      .post(
        SolendMiddleware.validateStuff,
        SolendController.withdraw
      )

    return this.app;
  }
}