import mongoose from 'mongoose';
import { PRIVACY_VISIBILITY_OPTIONS } from '../constants/privacy.js';

const privacySettingsSchema = new mongoose.Schema(
    {
        profilePhoto: {
            type: String,
            enum: PRIVACY_VISIBILITY_OPTIONS,
            default: 'everyone',
        },
        profilePhotoExceptions: {
            type: [
                {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'User',
                },
            ],
            default: [],
        },
        lastSeen: {
            type: String,
            enum: PRIVACY_VISIBILITY_OPTIONS,
            default: 'everyone',
        },
        lastSeenExceptions: {
            type: [
                {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'User',
                },
            ],
            default: [],
        },
    },
    { _id: false }
);

const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
    },
    fullName: {
        type: String,
        required: true,
        
    },
    about: {
        type: String,
        trim: true,
        maxlength: 160,
        default: "Available",
    },
    password: {
        type: String,
        required: true,
        minlength: 6,
    },
    profilePic: {
        type: String,
        default: "",
    },
    lastSeenAt: {
        type: Date,
        default: Date.now,
    },
    privacySettings: {
        type: privacySettingsSchema,
        default: () => ({}),
    },
    blockedUsers: {
        type: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
            },
        ],
        default: [],
    },
    resetPasswordOtpHash: {
        type: String,
        default: null,
    },
    resetPasswordOtpExpiresAt: {
        type: Date,
        default: null,
    },
    resetPasswordOtpAttempts: {
        type: Number,
        default: 0,
    },
    resetPasswordOtpLastSentAt: {
        type: Date,
        default: null,
    },
}, { timestamps: true });

 const User = mongoose.model('User', userSchema);

 export default User;


    
    