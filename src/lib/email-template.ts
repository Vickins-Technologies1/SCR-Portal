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
        body { margin: 0; padding: 0; background-color: #eef2f7; font-family: 'Inter', Arial, sans-serif; color: #0f172a; }
        .container { max-width: 680px; margin: 28px auto; background-color: #ffffff; border-radius: 18px; box-shadow: 0 12px 40px rgba(15, 23, 42, 0.12); overflow: hidden; }
        .header { background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 45%, #10b981 100%); padding: 36px 28px; text-align: center; }
        .logo { max-width: 160px; height: auto; margin-bottom: 12px; }
        .title { color: #ffffff; font-size: 26px; font-weight: 700; margin: 0; letter-spacing: 0.4px; }
        .subtle { color: #e2e8f0; font-size: 13px; margin-top: 6px; }
        .content { padding: 32px 28px 12px; }
        .intro { font-size: 16px; color: #1f2937; line-height: 1.7; margin-bottom: 22px; }
        .details { background: #f8fafc; border: 1px solid #e2e8f0; padding: 22px; border-radius: 12px; font-size: 15px; color: #1f2937; line-height: 1.7; }
        .details ul { list-style: none; padding: 0; margin: 0; }
        .details li { margin-bottom: 14px; }
        .details li strong { color: #1e3a8a; font-weight: 600; }
        .badge { display: inline-block; background: #e0f2fe; color: #1e3a8a; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; }
        .details a.button { display: inline-block; padding: 12px 26px; background-color: #10b981; color: #ffffff; text-decoration: none; border-radius: 10px; font-size: 15px; font-weight: 600; margin-top: 12px; }
        .details a.button:hover { background-color: #059669; }
        .footer { font-size: 13px; color: #64748b; padding: 22px 28px 28px; text-align: center; border-top: 1px solid #e2e8f0; background-color: #f8fafc; }
        .footer a { color: #1e3a8a; text-decoration: none; font-weight: 600; }
        .footer a:hover { text-decoration: underline; }
        @media (max-width: 640px) {
          .container { margin: 16px; }
          .title { font-size: 22px; }
          .content { padding: 20px; }
          .details { padding: 16px; }
          .details a.button { padding: 10px 18px; font-size: 14px; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <img class="logo" src="https://app.soranapropertymanagers.com/logo.png" alt="Sorana Property Managers Logo">
          <h1 class="title">${title}</h1>
          <div class="subtle">Sorana Property Managers Ltd.</div>
        </div>
        <div class="content">
          <p class="intro">${intro}</p>
          <div class="details">
            ${details}
          </div>
        </div>
        <div class="footer">
          <p>If you have any questions, please <a href="mailto:support@soranapropertymanagers.com">contact our support team</a>.</p>
          <p>Thank you for choosing Sorana Property Managers Ltd.</p>
          <p>&mdash; Sorana Property Managers Team</p>
        </div>
      </div>
    </body>
    </html>
  `;
};
