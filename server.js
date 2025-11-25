require("dotenv").config();
const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");
const admin = require("firebase-admin");

const requiredEnvVars = [
  'FIREBASE_PROJECT_ID',
  'FIREBASE_PRIVATE_KEY',
  'FIREBASE_CLIENT_EMAIL',
  'EMAIL_USER',
  'EMAIL_PASS',
  'CC_EMAIL'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
  console.error('Missing required environment variables:', missingVars.join(', '));
  process.exit(1);
}

const serviceAccount = {
  type: process.env.FIREBASE_TYPE || "service_account",
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: process.env.FIREBASE_AUTH_URI || "https://accounts.google.com/o/oauth2/auth",
  token_uri: process.env.FIREBASE_TOKEN_URI || "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL || "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
  universe_domain: "googleapis.com"
};

let db;
try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  db = admin.firestore();
  console.log('Firebase initialized successfully');
} catch (initErr) {
  console.error("Firebase initialization error:", initErr.message);
  process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.urlencoded({ extended: true, limit: "5mb" }));
app.use(express.json({ limit: "5mb" }));

app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    console.error("Invalid JSON received:", err.message);
    return res.status(400).json({ success: false, message: "Invalid JSON format." });
  }
  next(err);
});

console.log('Email configured for:', process.env.EMAIL_USER?.substring(0, 3) + '***');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

transporter.verify(function (error, success) {
  if (error) {
    console.error('SMTP Connection Error:', error.message);
    console.error('Make sure you are using a Gmail App Password');
  } else {
    console.log('Email server is ready');
  }
});

const sanitizeHtml = (text) => {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/\n/g, '<br>');
};

const isValidEmail = (email) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

app.post("/send-email", async (req, res) => {
  try {
    const { journalName, title, name, email, abstract } = req.body;

    if (!journalName || !title || !name || !email || !abstract) {
      return res.status(400).json({ success: false, message: "All fields are required." });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ success: false, message: "Invalid email address." });
    }

    const userMailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Thank You for Your Submission",
      html: `
        <h2>Thank You for Your Submission!</h2>
        <p>We have received your journal submission. Your submitted article has been forwarded to the respective journal and they will get back to you shortly.</p>
        <p><strong>Abstract:</strong></p>
        <p>${sanitizeHtml(abstract)}</p>
        <p>With Regards,</p>
        <p>IJIN Team</p>
      `,
    };

    const ccMailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.CC_EMAIL,
      subject: "New Journal Submission Received",
      html: `
        <h2>New Journal Submission</h2>
        <p><strong>Journal Name:</strong> ${sanitizeHtml(journalName)}</p>
        <p><strong>Title:</strong> ${sanitizeHtml(title)}</p>
        <p><strong>Name:</strong> ${sanitizeHtml(name)}</p>
        <p><strong>User Email:</strong> ${email}</p>
        <p><strong>Abstract:</strong></p>
        <p>${sanitizeHtml(abstract)}</p>
      `,
    };

    await Promise.all([
      transporter.sendMail(userMailOptions),
      transporter.sendMail(ccMailOptions)
    ]);

    res.json({ success: true, message: "Emails sent successfully!" });
  } catch (error) {
    console.error("Email sending error:", error.message);
    res.status(500).json({
      success: false,
      message: "Error sending email. Please try again later."
    });
  }
});

app.post("/contact", async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;

    if (!name || !email || !subject || !message) {
      return res.status(400).json({ success: false, message: "All fields are required." });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ success: false, message: "Invalid email address." });
    }

    await db.collection("contact_forms").add({
      name,
      email,
      subject,
      message,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const userMailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Thank You for Contacting Us!",
      html: `<p>Hi ${sanitizeHtml(name)}, we have received your message and will get back to you soon.</p>`,
    };

    const ccMailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.CC_EMAIL,
      subject: `New Contact Form: ${sanitizeHtml(subject)}`,
      html: `
        <p><strong>Name:</strong> ${sanitizeHtml(name)}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Message:</strong></p>
        <p>${sanitizeHtml(message)}</p>
      `,
    };

    await Promise.all([
      transporter.sendMail(userMailOptions),
      transporter.sendMail(ccMailOptions)
    ]);

    res.json({ success: true, message: "Contact form submitted successfully!" });
  } catch (error) {
    console.error("Contact form error:", error.message);
    res.status(500).json({ success: false, message: "Internal server error." });
  }
});

app.post("/conferenceemail", async (req, res) => {
  try {
    const {
      title,
      organizer,
      venue,
      date,
      contactPerson,
      email,
      country,
      language,
      description
    } = req.body;

    if (!title || !organizer || !email) {
      return res.status(400).json({
        success: false,
        message: "Required fields are missing."
      });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ success: false, message: "Invalid email address." });
    }

    const userMailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Thank You for Your Conference Submission",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 5px;">
          <h2 style="color: #333;">Thank You for Your Conference Submission</h2>
          <p>Dear ${sanitizeHtml(contactPerson)},</p>
          <p>We have received your conference/symposium submission for "${sanitizeHtml(title)}". Your submission has been forwarded to our IJIN team for review.</p>
          <p>We will get back to you shortly with further information.</p>
          <p>With Regards,</p>
          <p>IJIN Team</p>
        </div>
      `,
    };

    const adminMailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.CC_EMAIL,
      subject: `New Conference Submission: ${sanitizeHtml(title)}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 5px;">
          <h2 style="color: #333;">New Conference Submission</h2>
          <p>A new conference/symposium submission has been received:</p>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;"><strong>Conference Title</strong></td>
              <td style="padding: 8px; border: 1px solid #ddd;">${sanitizeHtml(title)}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;"><strong>Organizer</strong></td>
              <td style="padding: 8px; border: 1px solid #ddd;">${sanitizeHtml(organizer)}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;"><strong>Venue</strong></td>
              <td style="padding: 8px; border: 1px solid #ddd;">${sanitizeHtml(venue)}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;"><strong>Date</strong></td>
              <td style="padding: 8px; border: 1px solid #ddd;">${sanitizeHtml(date)}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;"><strong>Contact Person</strong></td>
              <td style="padding: 8px; border: 1px solid #ddd;">${sanitizeHtml(contactPerson)}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;"><strong>Email</strong></td>
              <td style="padding: 8px; border: 1px solid #ddd;">${email}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;"><strong>Country</strong></td>
              <td style="padding: 8px; border: 1px solid #ddd;">${sanitizeHtml(country)}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;"><strong>Language</strong></td>
              <td style="padding: 8px; border: 1px solid #ddd;">${sanitizeHtml(language)}</td>
            </tr>
          </table>
          <div style="border: 1px solid #ddd; padding: 10px; margin-bottom: 20px;">
            <strong>Description:</strong>
            <div>${sanitizeHtml(description)}</div>
          </div>
        </div>
      `,
    };

    await Promise.all([
      transporter.sendMail(userMailOptions),
      transporter.sendMail(adminMailOptions)
    ]);

    await db.collection("email_logs").add({
      type: "conference_submission",
      userEmail: email,
      adminEmail: process.env.CC_EMAIL,
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      success: true
    });

    res.json({ success: true, message: "Emails sent successfully!" });
  } catch (error) {
    console.error("Email sending error:", error.message);
    await db.collection("email_logs").add({
      type: "conference_submission",
      error: error.message,
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      success: false
    });

    res.status(500).json({ success: false, message: "Error sending email." });
  }
});

app.post("/journalsubmission", async (req, res) => {
  try {
    const {
      title,
      abbreviation,
      url,
      issnPrint,
      issnOnline,
      publisher,
      discipline,
      chiefEditor,
      email,
      country,
      language,
      frequency,
      yearOfStarting,
      licenseType,
      acessingType,
      articleFormats,
      description
    } = req.body;

    if (!title || !email) {
      return res.status(400).json({
        success: false,
        message: "Required fields are missing."
      });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ success: false, message: "Invalid email address." });
    }

    const userMailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Thank You for Your Journal Submission",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 5px;">
          <h2 style="color: #333;">Thank You for Your Journal Submission</h2>
          <p>Dear ${sanitizeHtml(chiefEditor) || "Journal Editor"},</p>
          <p>We have received your journal submission for "${sanitizeHtml(title)}". Your submission has been forwarded to our IJIN team for review.</p>
          <p>We will get back to you shortly with further information.</p>
          <p>With Regards,</p>
          <p>IJIN Team</p>
        </div>
      `,
    };

    const adminMailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.CC_EMAIL,
      subject: `New Journal Submission: ${sanitizeHtml(title)}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 5px;">
          <h2 style="color: #333;">New Journal Submission</h2>
          <p>A new journal submission has been received:</p>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;"><strong>Journal Title</strong></td>
              <td style="padding: 8px; border: 1px solid #ddd;">${sanitizeHtml(title)}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;"><strong>Abbreviation</strong></td>
              <td style="padding: 8px; border: 1px solid #ddd;">${sanitizeHtml(abbreviation) || "-"}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;"><strong>Journal URL</strong></td>
              <td style="padding: 8px; border: 1px solid #ddd;">${sanitizeHtml(url) || "-"}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;"><strong>ISSN (Print)</strong></td>
              <td style="padding: 8px; border: 1px solid #ddd;">${sanitizeHtml(issnPrint) || "-"}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;"><strong>ISSN (Online)</strong></td>
              <td style="padding: 8px; border: 1px solid #ddd;">${sanitizeHtml(issnOnline) || "-"}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;"><strong>Publisher</strong></td>
              <td style="padding: 8px; border: 1px solid #ddd;">${sanitizeHtml(publisher) || "-"}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;"><strong>Discipline</strong></td>
              <td style="padding: 8px; border: 1px solid #ddd;">${sanitizeHtml(discipline) || "-"}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;"><strong>Chief Editor</strong></td>
              <td style="padding: 8px; border: 1px solid #ddd;">${sanitizeHtml(chiefEditor) || "-"}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;"><strong>Email</strong></td>
              <td style="padding: 8px; border: 1px solid #ddd;">${email}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;"><strong>Country</strong></td>
              <td style="padding: 8px; border: 1px solid #ddd;">${sanitizeHtml(country) || "-"}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;"><strong>Language</strong></td>
              <td style="padding: 8px; border: 1px solid #ddd;">${sanitizeHtml(language) || "-"}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;"><strong>Frequency</strong></td>
              <td style="padding: 8px; border: 1px solid #ddd;">${sanitizeHtml(frequency) || "-"}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;"><strong>Year of Starting</strong></td>
              <td style="padding: 8px; border: 1px solid #ddd;">${sanitizeHtml(yearOfStarting) || "-"}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;"><strong>License Type</strong></td>
              <td style="padding: 8px; border: 1px solid #ddd;">${sanitizeHtml(licenseType) || "-"}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;"><strong>Accessing Type</strong></td>
              <td style="padding: 8px; border: 1px solid #ddd;">${sanitizeHtml(acessingType) || "-"}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;"><strong>Article Formats</strong></td>
              <td style="padding: 8px; border: 1px solid #ddd;">${sanitizeHtml(articleFormats) || "-"}</td>
            </tr>
          </table>
          <div style="border: 1px solid #ddd; padding: 10px; margin-bottom: 20px;">
            <strong>Description:</strong>
            <div>${sanitizeHtml(description) || "-"}</div>
          </div>
        </div>
      `,
    };

    await Promise.all([
      transporter.sendMail(userMailOptions),
      transporter.sendMail(adminMailOptions)
    ]);

    await db.collection("email_logs").add({
      type: "journal_submission",
      userEmail: email,
      adminEmail: process.env.CC_EMAIL,
      journalTitle: title,
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      success: true
    });

    res.json({ success: true, message: "Journal submission emails sent successfully!" });
  } catch (error) {
    console.error("Email sending error:", error.message);
    await db.collection("email_logs").add({
      type: "journal_submission",
      error: error.message,
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      success: false
    });

    res.status(500).json({ success: false, message: "Error sending email." });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});