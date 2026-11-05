import { createRemoteJWKSet, jwtVerify } from "jose";

const BETTER_AUTH_URL = process.env.BETTER_AUTH_URL;

const JWKS_URL = new URL("/api/auth/jwks", BETTER_AUTH_URL);

const JWKS = createRemoteJWKSet(JWKS_URL);

export async function verifyJWT(req, res, next) {
  const authorization = req.headers.authorization;

  if (!authorization || !authorization.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized: Token is missing",
    });
  }

  const token = authorization.slice(7).trim();

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized: Invalid token",
    });
  }

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: BETTER_AUTH_URL,
      audience: BETTER_AUTH_URL,
    });

    if (
      typeof payload.sub !== "string" ||
      !payload.sub ||
      typeof payload.email !== "string" ||
      !payload.email
    ) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: Invalid token claims",
      });
    }

    req.user = {
      id: payload.sub,
      email: payload.email.trim().toLowerCase(),
    };

    next();
  } catch (error) {
    console.error("JWT verification failed:", error.message);

    return res.status(401).json({
      success: false,
      message: "Unauthorized: Invalid or expired token",
    });
  }
}
