const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjbWZsZ3VpbWd0Y2Jza21lcGR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MDI1MTAsImV4cCI6MjA5NzE3ODUxMH0.w092N9tw6nf4fKJlDRIjTh8LcOpVXHzKqZd9awj_EKs";
const secret = "wPtnuvwCAyJ6PGmEZ9LtXRkbt8Yu9gB2lhUq5FIF/GIE+7OSi91cA8JD7lOEcRke9Ji/tEqOX/R0gKOFm2hQ+w==";

try {
  const decoded = jwt.verify(anonKey, secret, { algorithms: ["HS256"] });
  console.log("MATCH! Decoded:", decoded);
} catch (err) {
  console.log("MISMATCH!", err.message);
}
