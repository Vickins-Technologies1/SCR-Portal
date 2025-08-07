interface EmailTemplateOptions {
  name: string;
  intro: string;
  details: string;
  title: string;
}

export const generateStyledTemplate = ({ name, intro, details, title }: EmailTemplateOptions): string => {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap');
        body { margin: 0; padding: 0; background-color: #ffffff; font-family: 'Inter', Arial, sans-serif; }
        .container { max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1); overflow: hidden; }
        .header { text-align: center; padding: 24px; }
        .logo { max-width: 140px; height: auto; }
        .title { color: #1e3a8a; font-size: 24px; font-weight: 600; margin: 16px 0; }
        .content { padding: 24px; }
        .greeting { font-size: 16px; color: #1e3a8a; margin-bottom: 16px; }
        .intro { font-size: 15px; color: #1e3a8a; line-height: 1.6; margin-bottom: 24px; }
        .details { background-color: #f8fafc; border-left: 4px solid #10b981; padding: 20px; border-radius: 8px; font-size: 15px; color: #1e3a8a; }
        .details ul { list-style: none; padding: 0; margin: 0; }
        .details li { margin-bottom: 12px; }
        .details li strong { color: #1e3a8a; }
        .details a.button { display: inline-block; padding: 12px 24px; background-color: #10b981; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; margin-top: 12px; }
        .details a.button:hover { background-color: #059669; }
        .footer { font-size: 14px; color: #1e3a8a; padding: 24px; text-align: center; border-top: 1px solid #e5e7eb; }
        .footer a { color: #10b981; text-decoration: none; }
        .footer a:hover { color: #059669; }
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