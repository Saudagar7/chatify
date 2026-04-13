import aj from "../lib/arcjet.js";
import { isSpoofedBot } from "@arcjet/inspect";
import { ENV } from "../lib/env.js";

const shouldBypassArcjet = !ENV.ARCJET_KEY || ENV.NODE_ENV !== "production";

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
        }




     else if (decision.reason.isBot)  {

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
}


