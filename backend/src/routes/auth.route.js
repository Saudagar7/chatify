import express from 'express';
import {
	signup,
	login,
	logout,
	updateprofile,
	updatePrivacySettings,
	resetPassword,
	requestPasswordResetOtp,
	toggleBlockUser,
} from '../controllers/auth.controller.js';
import { protectRoute } from '../middleware/auth.middleware.js'; 
import arcjet from '@arcjet/node';
import { arcjetProtection } from '../middleware/arcjet.middleware.js';
 

const router = express.Router();

router.use(arcjetProtection);

router.post('/signup', signup);

router.post('/login', login);

router.post('/logout', logout);

router.post('/reset-password/request-otp', requestPasswordResetOtp);
router.post('/reset-password', resetPassword);

router.put("/update-profile", protectRoute, updateprofile);

router.put("/privacy", protectRoute, updatePrivacySettings);
router.put("/block", protectRoute, toggleBlockUser);

router.get ("/check",protectRoute, (req,res)=> res.status(200).json(req.user));

export default router;