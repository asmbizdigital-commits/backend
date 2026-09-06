/**
 * Politique de mot de passe applicative (création / reset / changement).
 * La connexion accepte encore d’anciens mots de passe plus courts.
 */
function validatePasswordStrength(password) {
  const value = String(password || '');
  if (value.length < 8) {
    return {
      ok: false,
      message: 'Le mot de passe doit contenir au moins 8 caractères.'
    };
  }
  if (value.length > 128) {
    return {
      ok: false,
      message: 'Le mot de passe est trop long (max. 128 caractères).'
    };
  }
  if (!/[A-Za-z]/.test(value) || !/[0-9]/.test(value)) {
    return {
      ok: false,
      message: 'Le mot de passe doit contenir au moins une lettre et un chiffre.'
    };
  }
  return { ok: true };
}

module.exports = { validatePasswordStrength };
