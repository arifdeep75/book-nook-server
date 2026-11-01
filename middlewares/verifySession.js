const verifySession = async (req, res, next) => {
  try {
    const cookie = req.headers.cookie;

    if (!cookie) {
      return res.status(401).json({
        success: false,
        message: "Please log in first.",
      });
    }

    const frontendUrl = process.env.FRONTEND_URL;

    if (!frontendUrl) {
      throw new Error("FRONTEND_URL is not configured.");
    }

    const response = await fetch(`${frontendUrl}/api/auth/get-session`, {
      method: "GET",
      headers: {
        cookie,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired session.",
      });
    }

    const data = await response.json();

    if (!data?.user || !data?.session) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized access.",
      });
    }

    req.user = {
      id: data.user.id,
      name: data.user.name,
      email: data.user.email,
      image: data.user.image || "",
    };

    next();
  } catch (error) {
    console.error("Session verification error:", error);

    return res.status(500).json({
      success: false,
      message: "Authentication verification failed.",
    });
  }
};

export default verifySession;