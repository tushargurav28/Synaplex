import mongoose from "mongoose";

/**
 * Middleware to validate MongoDB ObjectId in request params/query
 * @param {string} fieldName - Name of the field to validate (e.g., "conversationId")
 * @param {string} location - Where to check: "params", "query", or "body" (default: "params")
 */
export const validateObjectId = (fieldName, location = "params") => {
    return (req, res, next) => {
        const id = req[location]?.[fieldName];
        
        if (!id) {
            return res.status(400).json({ error: `${fieldName} is required` });
        }
        
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ error: `Invalid ${fieldName} format` });
        }
        
        next();
    };
};