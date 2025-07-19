'use server';

import nodemailer from "nodemailer";

interface EmailTemplateOptions {
  name: string;
  intro: string;
  details: string;
  title: string;
}

interface WelcomeEmailOptions {
  to: string;
  name: string;
  email: string;
  password: string;
  loginUrl: string;
  propertyName: string; // Changed from propertyId to propertyName
  houseNumber: string;
}

interface UpdateEmailOptions {
  to: string;
  name: string;
  email: string;
  propertyId?: string;
  houseNumber?: string;
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const generateStyledTemplate = ({ name, intro, details, title }: EmailTemplateOptions): string => {

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap');
        body { margin: 0; padding: 0; background-color: #f4f4f4; font-family: 'Inter', Arial, sans-serif; }
        .container { max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1); overflow: hidden; }
        .header { text-align: center; padding: 24px; }
        .logo { max-width: 140px; height: auto; }
        .title { color: #1e3a8a; font-size: 24px; font-weight: 600; margin: 16px 0; }
        .content { padding: 24px; }
        .greeting { font-size: 16px; color: #333333; margin-bottom: 16px; }
        .intro { font-size: 15px; color: #4b5563; line-height: 1.6; margin-bottom: 24px; }
        .details { background-color: #f9fafb; border-left: 4px solid #10b981; padding: 20px; border-radius: 8px; font-size: 15px; color: #333333; }
        .details ul { list-style: none; padding: 0; margin: 0; }
        .details li { margin-bottom: 12px; }
        .details li strong { color: #1e3a8a; }
        .details a.button { display: inline-block; padding: 12px 24px; background-color: #1e3a8a; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; margin-top: 12px; }
        .details a.button:hover { background-color: #1e40af; }
        .footer { font-size: 14px; color: #6b7280; padding: 24px; text-align: center; border-top: 1px solid #e5e7eb; }
        .footer a { color: #1e3a8a; text-decoration: none; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
         <h1 class="title">${title}</h1>
        </div>
        <div class="content">
          <p class="greeting">Hi <strong>${name}</strong>,</p>
          <p class="intro">${intro}</p>
          <div class="details">
            ${details}
          </div>
        </div>
        <div class="footer">
          <p>If you have any questions, feel free to <a href="mailto:support@smartchoicerental.com">reach out to our support team</a>.</p>
          <p>&mdash; Smart Choice Rental Management Team</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

export async function sendWelcomeEmail({
  to,
  name,
  email,
  password,
  loginUrl,
  propertyName,
  houseNumber,
}: WelcomeEmailOptions): Promise<void> {
  try {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      throw new Error("SMTP credentials are missing");
    }

    const html = generateStyledTemplate({
      name,
      title: "Welcome to Your New Home!",
      intro: "Your tenant account has been successfully created. Below are your login details to access your account and manage your rental information.",
      details: `
        <ul>
          <li><strong>Email:</strong> ${email}</li>
          <li><strong>Temporary Password:</strong> ${password}</li>
          <li><strong>Login:</strong> <a href="${loginUrl}" class="button">Log in to Your Account</a></li>
          <li><strong>Property:</strong> ${propertyName}</li>
          <li><strong>House Number:</strong> ${houseNumber}</li>
        </ul>
        <p style="font-size: 14px; margin-top: 16px;">For security, please set a new password after logging in.</p>
      `,
    });

    await transporter.sendMail({
      from: `"Smart Choice Rental Management" <${process.env.SMTP_USER}>`,
      to,
      subject: "Welcome to Your New Home!",
      html,
    });
    console.log(`Welcome email sent to ${to}`);
  } catch (error) {
    console.error(`Error sending welcome email to ${to}:`, error);
    throw new Error("Failed to send welcome email");
  }
}

export async function sendUpdateEmail({
  to,
  name,
  email,
  propertyId,
  houseNumber,
}: UpdateEmailOptions): Promise<void> {
  try {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      throw new Error("SMTP credentials are missing");
    }

    const detailItems = [
      `<li><strong>Email:</strong> ${email}</li>`,
      propertyId ? `<li><strong>Property ID:</strong> ${propertyId}</li>` : "",
      houseNumber ? `<li><strong>House Number:</strong> ${houseNumber}</li>` : "",
    ].filter(Boolean).join("");

    const html = generateStyledTemplate({
      name,
      title: "Tenant Account Updated",
      intro: "Your account details have been successfully updated.",
      details: `<ul>${detailItems}</ul>`,
    });

    await transporter.sendMail({
      from: `"Smart Choice Rental Management" <${process.env.SMTP_USER}>`,
      to,
      subject: "Your Account Details Have Been Updated",
      html,
    });
    console.log(`Update email sent to ${to}`);
  } catch (error) {
    console.error(`Error sending update email to ${to}:`, error);
    throw new Error("Failed to send update email");
  }
}