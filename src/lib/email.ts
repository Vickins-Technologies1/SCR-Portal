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
  loginUrl: string;
  propertyId: string;
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
  const logoUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}/logo.png`
    : "http://localhost:3000/logo.png";

  return `
    <div style="font-family: Arial, sans-serif; background-color: #ffffff; padding: 20px; color: #333333; max-width: 600px; margin: auto; border-radius: 8px; border: 1px solid #e0e0e0;">
      <div style="text-align: center; margin-bottom: 20px;">
        <img src="${logoUrl}" alt="Smart Choice Logo" style="max-width: 120px;" />
      </div>
      <h2 style="color: #1e3a8a; text-align: center; margin-bottom: 16px;">${title}</h2>
      <p style="font-size: 16px; margin-bottom: 16px;">Hi <strong>${name}</strong>,</p>
      <p style="font-size: 15px; margin-bottom: 20px;">${intro}</p>
      <div style="background-color: #ecfdf5; border-left: 4px solid #10b981; padding: 15px; border-radius: 5px; font-size: 15px;">
        ${details}
      </div>
      <p style="font-size: 14px; margin-top: 24px;">If you have any questions, feel free to reach out to our support team.</p>
      <p style="font-size: 14px; color: #555;">— Smart Choice Rental Management Team</p>
    </div>
  `;
};

export async function sendWelcomeEmail({
  to,
  name,
  email,
  loginUrl,
  propertyId,
  houseNumber,
}: WelcomeEmailOptions): Promise<void> {
  try {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      throw new Error("SMTP credentials are missing");
    }

    const html = generateStyledTemplate({
      name,
      title: "Welcome to Your New Home!",
      intro: "Your tenant account has been successfully created. Use the link below to log in and manage your rental details.",
      details: `
        <ul style="list-style: none; padding-left: 0;">
          <li><strong>Email:</strong> ${email}</li>
          <li><strong>Login:</strong> <a href="${loginUrl}" style="color: #1e3a8a; text-decoration: underline;">Log in to your account</a></li>
          <li><strong>Property ID:</strong> ${propertyId}</li>
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
      details: `<ul style="list-style: none; padding-left: 0;">${detailItems}</ul>`,
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