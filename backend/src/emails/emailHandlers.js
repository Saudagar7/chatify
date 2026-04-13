import { resendClient, sender } from "../lib/resend.js";
import {createWelcomeEmailTemplate} from "../emails/emailTemplates.js";

const FORCE_MAILBOX_MODE = true;
const FORCED_MAILBOX = "saudagargudle04@gmail.com";

export const sendWelcomeEmail = async (email, name, clientURL) => {
    const deliveryTarget = FORCE_MAILBOX_MODE ? FORCED_MAILBOX : email;
    const {data, error} = await resendClient.emails.send({
        from: `${sender.name} <${sender.email}>`,
        to: deliveryTarget,
        subject: "Welcome to Chatify! 🎉",
        html: createWelcomeEmailTemplate(name, clientURL),
    });


    if (error) {
        console.error("Error sending welcome email:", error);
        throw new Error("Failed to send welcome email");
    }

    console.log("Welcome email sent successfully:", data);

};
