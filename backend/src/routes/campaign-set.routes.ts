import { Router, RequestHandler } from 'express';
import { campaignSetController } from '../controllers/campaign-set.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = Router();

router.use(authenticate as unknown as RequestHandler);

router.get('/', campaignSetController.getCampaignSets as RequestHandler);
router.get('/:id', campaignSetController.getCampaignSet as RequestHandler);
router.post('/', campaignSetController.createCampaignSet as RequestHandler);
router.put('/:id', campaignSetController.updateCampaignSet as RequestHandler);
router.delete('/:id', campaignSetController.deleteCampaignSet as RequestHandler);

// Kampanya stoğu işlemleri
router.post('/:id/stock', campaignSetController.createCampaignStock as RequestHandler);
router.post('/:id/sell', campaignSetController.sellCampaignSet as RequestHandler);
router.get('/:id/stock', campaignSetController.getCampaignStock as RequestHandler);

export default router;

