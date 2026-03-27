import User from "../models/User.js";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { ENV } from "../lib/env.js";
import cloudinary from "../lib/cloudinary.js";
import { generateToken } from "../lib/utils.js";
import { sendWelcomeEmail } from "../emails/emailHandlers.js";
import { PRIVACY_VISIBILITY_OPTIONS } from "../constants/privacy.js";

const normalizeId = (value) => {
    if (!value) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number") return value.toString();
    if (typeof value === "object") {
        if (value._id) return value._id.toString();
        if (value.id) return value.id.toString();
    }
    return value.toString?.() || "";
};

const sanitizeExceptionIds = (exceptions = [], selfId) => {
    const self = normalizeId(selfId);
    const seen = new Set();
    const sanitized = [];

    exceptions.forEach((entry) => {
        const candidate = normalizeId(entry);
        if (!candidate || candidate === self || seen.has(candidate)) return;
        if (!mongoose.Types.ObjectId.isValid(candidate)) return;
        seen.add(candidate);
        sanitized.push(new mongoose.Types.ObjectId(candidate));
    });

    return sanitized;
};


export const signup = async (req, res) => {
    const { fullName, email, password } = req.body;

  try {
        if (!fullName || !email || !password) {
                return res.status(400).json({ message: "All fields are required." });
}
if (password.length < 6) {
    return res.status(400).json({ message: "Password must be at least 6 characters" });
} 
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
if (!emailRegex.test(email)) {
    return res.status(400).json({ message: "Invalid email format." });
} 
const user = await User.findOne({ email });
if (user) return res.status(400).json({ message: "Email already exists." });

const salt = await bcrypt.genSalt(10);
const hashedPassword = await bcrypt.hash(password, salt);

const newUser = new User({
    fullName,
    email,
    password: hashedPassword,
});

if(newUser) {
    generateToken(newUser._id,res);
    const savedUser = await newUser.save();

    res.status(201).json({
        _id: savedUser._id,
        fullName: savedUser.fullName,
        email: savedUser.email,
        profilePic: savedUser.profilePic,
        about: savedUser.about,
        privacySettings: savedUser.privacySettings,
    });

    try {
        await sendWelcomeEmail(savedUser.email,savedUser.fullName, ENV.CLIENT_URL);
    } catch (error) {
        console.error("Failed to send welcome email:", error);
    }




} else {
    res.status(400).json({ message: "Invalid user data." });
}
    } catch (error) {
        console.log("Error in signup controller:", error);
        res.status(500).json({ message: " Internal server error." });
    }

};

export const login = async (req, res) => {
    const { email, password } = req.body

    if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
    }

    try {
        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ message: "Invalid credentials." });

        const isPasswordCorrect = await bcrypt.compare(password, user.password);
        if (!isPasswordCorrect)  return res.status(400).json({ message: "Invalid credentials." });

        generateToken(user._id,res)
        res.status(200).json({
            _id: user._id,
            fullName: user.fullName,
            email: user.email,
            profilePic: user.profilePic,
            about: user.about,
            privacySettings: user.privacySettings,
        });
       
    } catch (error) {
        console.error("Error in login controller:", error);
        res.status(500).json({ message: "Internal server error" });

 }    
};

export const resetPassword = async (req, res) => {
    const { email, newPassword } = req.body;

    if (!email || !newPassword) {
        return res.status(400).json({ message: "Email and new password are required" });
    }

    if (newPassword.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: "No account found with that email" });
        }

        const isSamePassword = await bcrypt.compare(newPassword, user.password);
        if (isSamePassword) {
            return res
                .status(400)
                .json({ message: "New password must be different from the current password" });
        }

        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);
        await user.save();

        return res.status(200).json({ message: "Password updated successfully" });
    } catch (error) {
        console.error("Error resetting password", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

export const logout =  (_, res) => {
    res.cookie("jwt", "", {maxAge:0})
    res.status(200).json({ message: "Logged out successfully" });
};

export const updateprofile = async (req, res) => {
    try {
        const userId = req.user._id;
        const { profilePic, fullName, about } = req.body;

        const updates = {};

        if (profilePic) {
            const uploadResponse = await cloudinary.uploader.upload(profilePic);
            updates.profilePic = uploadResponse.secure_url;
        }

        if (typeof fullName === "string" && fullName.trim()) {
            updates.fullName = fullName.trim();
        }

        if (typeof about === "string") {
            const sanitizedAbout = about.trim().slice(0, 160);
            updates.about = sanitizedAbout || "Available";
        }

        if (!Object.keys(updates).length) {
            return res.status(400).json({ message: "No profile changes provided" });
        }

        const updatedUser = await User.findByIdAndUpdate(userId, updates, {
            new: true,
        }).select("-password");

        res.status(200).json(updatedUser);
    } catch (error) {
        console.log("Error in updateprofile", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

export const updatePrivacySettings = async (req, res) => {
    try {
        const userId = req.user._id;
        const { profilePhoto, profilePhotoExceptions } = req.body;

        if (!profilePhoto || !PRIVACY_VISIBILITY_OPTIONS.includes(profilePhoto)) {
            return res.status(400).json({ message: "Invalid privacy option" });
        }

        const nextExceptions = Array.isArray(profilePhotoExceptions)
            ? sanitizeExceptionIds(profilePhotoExceptions, userId)
            : sanitizeExceptionIds(req.user.privacySettings?.profilePhotoExceptions || [], userId);

        const updatedUser = await User.findByIdAndUpdate(
            userId,
            {
                $set: {
                    "privacySettings.profilePhoto": profilePhoto,
                    "privacySettings.profilePhotoExceptions": nextExceptions,
                },
            },
            { new: true }
        ).select("-password");

        res.status(200).json(updatedUser);
    } catch (error) {
        console.error("Error in updatePrivacySettings", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

