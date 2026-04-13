/*
Original Arcjet middleware (kept for quick restore):

import aj from "../lib/arcjet.js";
import { isSpoofedBot } from "@arcjet/inspect";
import { ENV } from "../lib/env.js";

const arcjetEnv = (ENV.ARCJET_ENV || "").toLowerCase();
const shouldBypassArcjet =
	!ENV.ARCJET_KEY ||
	ENV.NODE_ENV !== "production" ||
	arcjetEnv === "disabled" ||
	arcjetEnv === "off" ||
	arcjetEnv === "false";

export const arcjetProtection = async (req, res, next) => {
	if (shouldBypassArcjet) return next();
   try {
	const decision = await aj.protect(req);

	if(decision.isDenied) {
		if(decision.reason.isRateLimit) {
			const retryAfterSeconds = Number(decision.reason?.retryAfter || 60);
			if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
				res.set("Retry-After", Math.ceil(retryAfterSeconds).toString());
			}
			return res.status(429).json({
				message: "Rate limit exceeded. Please try again later.",
				retryAfter: Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
					? Math.ceil(retryAfterSeconds)
					: 60,
			});
		} else if (decision.reason.isBot)  {
			return res.status(403).json({ message: "Access denied. Bot traffic is not allowed." });
		} else {
			return res.status(403).json({ message: "Access denied by security policy." });
		}
	}

	if(decision.results.some(isSpoofedBot)) {
		return res.status(403).json({ message: "Access denied. Bot traffic is not allowed." });
	}
	next();
} catch (error) {
	console.log("Arcjet Protection error:", error);
	next();
}
};
*/

// Temporary emergency bypass: Arcjet protection disabled.
export const arcjetProtection = async (_req, _res, next) => next();


