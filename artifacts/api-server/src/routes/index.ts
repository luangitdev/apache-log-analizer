import { Router, type IRouter } from "express";
import healthRouter from "./health";
import logsRouter from "./logs";
import appsRouter from "./apps";
import statsRouter from "./stats";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/logs", logsRouter);
router.use("/apps", appsRouter);
router.use("/stats", statsRouter);

export default router;
