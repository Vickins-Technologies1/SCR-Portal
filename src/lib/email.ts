import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";

let logoBase64: string | null = null;

function getLogoBase64(): string {
  if (logoBase64) return logoBase64;
  const logoPath = path.join(process.cwd(), "public", "logo.png");
  const logoBuffer = fs.readFileSync(logoPath);
  logoBase64 = `data:image/png;base64,${logoBuffer.toString("base64")}`;
  return logoBase64;
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

const generateStyledTemplate = ({
  name,
  intro,
  details,
  title,
}: {
  name: string;
  intro: string;
  details: string;
  title: string;
}) => {
  const logo = getLogoBase64();
  return `
    <div style="font-family: Arial, sans-serif; background-color: #ffffff; padding: 20px; color: #333333; max-width: 600px; margin: auto; border-radius: 8px; border: 1px solid #e0e0e0;">
      <div style="text-align: center; margin-bottom: 20px;">
        <img src="${logo}" alt="Smart Choice Logo" style="max-width: 120px;" />
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

export async function sendWelcomeEmail(
  to: string,
  name: string,
  email: string,
  password: string,
  propertyId: string,
  houseNumber: string
) {
  const html = generateStyledTemplate({
    name,
    title: "Welcome to Your New Home!",
    intro: "Your tenant account has been successfully created. You can now log in and manage your rental details.",
    details: `
      <ul style="list-style: none; padding-left: 0;">
        <li><strong>Email:</strong> ${email}</li>
        <li><strong>Password:</strong> ${password}</li>
        <li><strong>Property ID:</strong> ${propertyId}</li>
        <li><strong>House Number:</strong> ${houseNumber}</li>
      </ul>
    `,
  });

  await transporter.sendMail({
    from: `"Smart Choice Rental Management" <${process.env.SMTP_USER}>`,
    to,
    subject: "Welcome to Your New Home!",
    html,
  });
}

export async function sendUpdateEmail(
  to: string,
  name: string,
  email: string,
  password?: string,
  propertyId?: string,
  houseNumber?: string
) {
  const detailItems = [
    `<li><strong>Email:</strong> ${email}</li>`,
    password ? `<li><strong>Password:</strong> ${password}</li>` : "",
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
}
