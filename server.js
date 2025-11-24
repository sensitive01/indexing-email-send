require("dotenv").config();
const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");
const admin = require("firebase-admin");

const serviceAccount = {
  type: process.env.FIREBASE_TYPE,
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: process.env.FIREBASE_AUTH_URI,
  token_uri: process.env.FIREBASE_TOKEN_URI,
  auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
  client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
  universe_domain: "googleapis.com"
};



try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
} catch (initErr) {
  console.error("Firebase initialization error:", initErr);
  // do not throw here so the process logs the error and exits with a visible message in Render logs
}

const db = admin.firestore();

const app = express();
app.use(cors());

// <<< ADDED: Accept urlencoded form bodies (multiline text / form submissions)
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

app.use(express.json());

// <<< ADDED: global JSON syntax error handler to return 400 instead of crashing
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    // express.json() parse error
    console.error("Invalid JSON received:", err.message);
    return res.status(400).json({ success: false, message: "Invalid JSON format." });
  }
  // some other error or no error
  next();
});

console.log(process.env.EMAIL_USER)
console.log(process.env.EMAIL_PASS)

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: {
    rejectUnauthorized: false
  }
});

app.post("/send-email", async (req, res) => {
  try {
    const { journalName, title, name, email, abstract } = req.body;

    if (!journalName || !title || !name || !email || !abstract) {
      return res.status(400).json({ success: false, message: "All fields are required." });
    }

    const userMailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Thank You for Your Submission",
      html: `
        <h2>Thank You for Your Submission!</h2>
        <p>We have received your journal submission. Your Submitted article forwarded to respective journal and they get back to you shortly.</p>
        <p><strong>Abstract:</strong> ${abstract}</p>
        <p> With Regards</p>
        <p>IJIN Team</p>
      `,
    };

    const ccMailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.CC_EMAIL,
      subject: "New Journal Submission Received",
      html: `
        <h2>New Journal Submission</h2>
        <p><strong>Journal Name:</strong> ${journalName}</p>
        <p><strong>Title:</strong> ${title}</p>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>User Email:</strong> ${email}</p>
        <p><strong>Abstract:</strong> ${abstract}</p>
      `,
    };



        await Promise.all([
      transporter.sendMail(userMailOptions),
      transporter.sendMail(ccMailOptions)
    ]);

    res.json({ success: true, message: "Emails sent successfully!" });
  } catch (error) {
    console.error("Email sending error:", error);
    res.status(500).json({ success: false, message: "Error sending email." });
  }
});


app.post("/contact", async (req, res) => {
  try {
    console.log("Received Contact Form Data:", req.body);

    const { name, email, subject, message } = req.body;

    if (!name || !email || !subject || !message) {
      return res.status(400).json({ success: false, message: "All fields are required." });
    }
    await db.collection("contact_forms").add({
      name,
      email,
      subject,
      message,
      createdAt: new Date(),
    });

    const userMailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Thank You for Contacting Us!",
      html: `<p>Hi ${name}, we have received your message and will get back to you soon.</p>`,
    };

    const ccMailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.CC_EMAIL,
      subject: `New Contact Form Submission: ${subject}`,
      html: `<p><strong>Name:</strong> ${name}</p><p><strong>Email:</strong> ${email}</p><p><strong>Message:</strong> ${message}</p>`,
    };


    await Promise.all([
      transporter.sendMail(userMailOptions),
      transporter.sendMail(ccMailOptions)
    ]);


    res.json({ success: true, message: "Contact form submitted successfully!" });

  } catch (error) {
    console.error("Error handling contact form:", error);
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
    const userMailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Thank You for Your Conference Submission",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 5px;">
          <h2 style="color: #333;">Thank You for Your Conference Submission</h2>
          <p>Dear ${contactPerson},</p>
          <p>We have received your conference/symposium submission for "${title}". Your submission has been forwarded to our IJIN team for review.</p>
          <p>We will get back to you shortly with further information.</p>
          <p>With Regards,</p>
          <p>IJIN Team</p>
        </div>
      `,
    };

    const adminMailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.CC_EMAIL,
      subject: `New Conference Submission: ${title}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 5px;">
          <h2 style="color: #333;">New Conference Submission</h2>
          <p>A new conference/symposium submission has been received:</p>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;"><strong>Conference Title</strong></td>
              <td style="padding: 8px; border: 1px solid #ddd;">${title}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;"><strong>Organizer</strong></td>
              <td style="padding: 8px; border: 1px solid #ddd;">${organizer}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;"><strong>Venue</strong></td>
              <td style="padding: 8px; border: 1px solid #ddd;">${venue}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;"><strong>Date</strong></td>
              <td style="padding: 8px; border: 1px solid #ddd;">${date}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;"><strong>Contact Person</strong></td>
              <td style="padding: 8px; border: 1px solid #ddd;">${contactPerson}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;"><strong>Email</strong></td>
              <td style="padding: 8px; border: 1px solid #ddd;">${email}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;"><strong>Country</strong></td>
              <td style="padding: 8px; border: 1px solid #ddd;">${country}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;"><strong>Language</strong></td>
              <td style="padding: 8px; border: 1px solid #ddd;">${language}</td>
            </tr>
          </table>
          <div style="border: 1px solid #ddd; padding: 10px; margin-bottom: 20px;">
            <strong>Description:</strong>
            <div>${description}</div>
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
    console.error("Email sending error:", error);
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

    const userMailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Thank You for Your Journal Submission",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 5px;">
          <h2 style="color: #333;">Thank You for Your Journal Submission</h2>
          <p>Dear ${chiefEditor || "Journal Editor"},</p>
          <p>We have received your journal submission for "${title}". Your submission has been forwarded to our IJIN team for review.</p>
          <p>We will get back to you shortly with further information.</p>
          <p>With Regards,</p>
          <p>IJIN Team</p>
        </div>
      `,
    };

    const adminMailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.CC_EMAIL,
      subject: `New Journal Submission: ${title}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 5px;">
          <h2 style="color: #333;">New Journal Submission</h2>
          <p>A new journal submission has been received:</p>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;"><strong>Journal Title</strong></td>
              <td style="padding: 8px; border: 1px solid #ddd;">${title}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;"><strong>Abbreviation</strong></td>
              <td style="padding: 8px; border: 1px solid #ddd;">${abbreviation || "-"}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;"><strong>Journal URL</strong></td>
              <td style="padding: 8px; border: 1px solid #ddd;">${url || "-"}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;"><strong>ISSN (Print)</strong></td>
              <td style="padding: 8px; border: 1px solid #ddd;">${issnPrint || "-"}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;"><strong>ISSN (Online)</strong></td>
              <td style="padding: 8px; border: 1px solid #ddd;">${issnOnline || "-"}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;"><strong>Publisher</strong></td>
              <td style="padding: 8px; border: 1px solid #ddd;">${publisher || "-"}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;"><strong>Discipline</strong></td>
              <td style="padding: 8px; border: 1px solid #ddd;">${discipline || "-"}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;"><strong>Chief Editor</strong></td>
              <td style="padding: 8px; border: 1px solid #ddd;">${chiefEditor || "-"}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;"><strong>Email</strong></td>
              <td style="padding: 8px; border: 1px solid #ddd;">${email}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;"><strong>Country</strong></td>
              <td style="padding: 8px; border: 1px solid #ddd;">${country || "-"}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;"><strong>Language</strong></td>
              <td style="padding: 8px; border: 1px solid #ddd;">${language || "-"}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;"><strong>Frequency</strong></td>
              <td style="padding: 8px; border: 1px solid #ddd;">${frequency || "-"}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;"><strong>Year of Starting</strong></td>
              <td style="padding: 8px; border: 1px solid #ddd;">${yearOfStarting || "-"}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;"><strong>License Type</strong></td>
              <td style="padding: 8px; border: 1px solid #ddd;">${licenseType || "-"}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;"><strong>Accessing Type</strong></td>
              <td style="padding: 8px; border: 1px solid #ddd;">${acessingType || "-"}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;"><strong>Article Formats</strong></td>
              <td style="padding: 8px; border: 1px solid #ddd;">${articleFormats || "-"}</td>
            </tr>
          </table>
          <div style="border: 1px solid #ddd; padding: 10px; margin-bottom: 20px;">
            <strong>Description:</strong>
            <div>${description || "-"}</div>
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
    console.error("Email sending error:", error);
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
