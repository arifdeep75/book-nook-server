import { createRemoteJWKSet, jwtVerify } from "jose";

let jwksFrontendUrl;
let JWKS;

const verifyToken = async (req, res, next) => {
  try {
    const frontendUrl = process.env.FRONTEND_URL;

    if (!frontendUrl) {
      throw new Error("FRONTEND_URL is not configured.");
    }

    if (!JWKS || jwksFrontendUrl !== frontendUrl) {
      JWKS = createRemoteJWKSet(new URL("/api/auth/jwks", frontendUrl));
      jwksFrontendUrl = frontendUrl;
    }

    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "JWT token is required.",
      });
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "JWT token is missing.",
      });
    }

    const { payload } = await jwtVerify(token, JWKS, {
      issuer: frontendUrl,
      audience: frontendUrl,
    });

    if (!payload.sub) {
      return res.status(401).json({
        success: false,
        message: "Invalid JWT payload.",
      });
    }

    req.user = {
      id: payload.sub,
      name: payload.name,
      email: payload.email,
      image: payload.image || "",
    };

    next();
  } catch (error) {
    console.error("JWT verification failed:", error.message);

    return res.status(401).json({
      success: false,
      message: "Invalid or expired JWT token.",
    });
  }
};

export default verifyToken;