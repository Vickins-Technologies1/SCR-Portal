interface EmailTemplateOptions {
  name: string;
  intro: string;
  details: string;
  title: string;
}

export const generateStyledTemplate = ({ intro, details, title }: EmailTemplateOptions): string => {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        body { margin: 0; padding: 0; background-color: #f4f6f8; font-family: 'Inter', Arial, sans-serif; color: #1e3a8a; }
        .container { max-width: 640px; margin: 32px auto; background-color: #ffffff; border-radius: 16px; box-shadow: 0 6px 20px rgba(0, 0, 0, 0.08); overflow: hidden; }
        .header { background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%); padding: 32px 24px; text-align: center; }
        .logo { max-width: 160px; height: auto; }
        .title { color: #ffffff; font-size: 26px; font-weight: 700; margin: 0; letter-spacing: 0.5px; }
        .content { padding: 32px 24px; }
        .greeting { font-size: 18px; font-weight: 600; color: #1e3a8a; margin-bottom: 16px; }
        .intro { font-size: 16px; color: #374151; line-height: 1.7; margin-bottom: 24px; }
        .details { background-color: #f8fafc; border-left: 4px solid #10b981; padding: 24px; border-radius: 8px; font-size: 16px; color: #374151; line-height: 1.6; }
        .details ul { list-style: none; padding: 0; margin: 0; }
        .details li { margin-bottom: 16px; }
        .details li strong { color: #1e3a8a; font-weight: 600; }
        .details a.button { display: inline-block; padding: 14px 28px; background-color: #10b981; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600; margin-top: 16px; transition: background-color 0.3s ease; }
        .details a.button:hover { background-color: #059669; }
        .footer { font-size: 14px; color: #6b7280; padding: 24px; text-align: center; border-top: 1px solid #e5e7eb; background-color: #f8fafc; }
        .footer a { color: #10b981; text-decoration: none; font-weight: 500; }
        .footer a:hover { color: #059669; text-decoration: underline; }
        .social-links { margin-top: 16px; }
        .social-links a { margin: 0 8px; display: inline-block; }
        .social-links img { width: 24px; height: 24px; vertical-align: middle; }
        @media (max-width: 640px) {
          .container { margin: 16px; }
          .title { font-size: 22px; }
          .content { padding: 20px; }
          .details { padding: 16px; }
          .details a.button { padding: 12px 20px; font-size: 14px; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <img class="logo" src="https://app.smartchoicerentalmanagement.com/logo.png" alt="Smart Choice Rental Management Logo">
          <h1 class="title">${title}</h1>
        </div>
        <div class="content">
          <p class="intro">${intro}</p>
          <div class="details">
            ${details}
          </div>
        </div>
        <div class="footer">
          <p>If you have any questions, please <a href="mailto:support@smartchoicerentalmanagement.com">contact our support team</a>.</p>
          <p>Thank you for choosing Smart Choice Rental Management.</p>
          
          <p>&mdash; Smart Choice Rental Management Team</p>
        </div>
      </div>
    </body>
    </html>
  `;
};