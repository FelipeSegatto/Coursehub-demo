function authorizeRoles(...allowedRoles) {
  return function (req, res, next) {
    if (!req.auth) {
      return res.status(401).json({
        message: "Usuário não autenticado.",
      });
    }

    if (!allowedRoles.includes(req.auth.role)) {
      return res.status(403).json({
        message:
          "Você não possui permissão para esta operação.",
      });
    }

    return next();
  };
}

module.exports = authorizeRoles;