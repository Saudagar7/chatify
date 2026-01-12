import User from "../models/User.js";
import bcrypt from "bcryptjs";
import { ENV } from "../lib/env.js";


export const signup = async (req, res) => {
  const { username, email, password } = req.body;

  try {
    if (!username || !email || !password) {
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
    username,
    email,
    password: hashedPassword,
});

if(newUser) {
    generateToken(newUser._id,res);
    await newUser.save();

    res.status(201).json({
        _id: newUser._id,
        username: newUser.username,
        email: newUser.email,
        profilePic: newUser.profilePic,
    });

    try {
        await sendWelcomeEmail(savedUser.email,savedUser.username, ENV.CLIENT_URL);
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

