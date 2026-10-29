/**
 * Validador de direcciones de correo electronico.
 * Permite explicitamente cuentas de Gmail (@gmail.com), correos institucionales (.edu, .pe)
 * y proveedores comerciales legitimos, bloqueando unicamente dominios temporales/desechables
 * y dominios ficticios de prueba.
 */

// Proveedores comerciales reconocidos y plenamente admitidos
const TRUSTED_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "yahoo.com",
  "yahoo.es",
  "icloud.com",
  "proton.me",
  "protonmail.com"
]);

// Lista de dominios desechables, temporales o de buzon falso (disposable email providers)
const DISPOSABLE_DOMAINS = new Set([
  "10minutemail.com",
  "10minutemail.net",
  "20minutemail.com",
  "burnermail.io",
  "crazymailing.com",
  "dispostable.com",
  "dropmail.me",
  "emailondeck.com",
  "fakemailgenerator.com",
  "getairmail.com",
  "getnada.com",
  "guerrillamail.biz",
  "guerrillamail.com",
  "guerrillamail.de",
  "guerrillamail.net",
  "guerrillamail.org",
  "guerrillamailblock.com",
  "inboxkitten.com",
  "mailcatch.com",
  "mailinator.com",
  "mailinator.net",
  "mohmal.com",
  "mytrashmail.com",
  "mytemp.email",
  "nada.ltd",
  "sharklasers.com",
  "spam4.me",
  "temp-mail.org",
  "tempail.com",
  "tempmail.com",
  "tempmail.net",
  "throwawaymail.com",
  "trashmail.com",
  "trashmail.net",
  "trashmail.org",
  "yopmail.com",
  "yopmail.fr",
  "yopmail.net"
]);

// Dominios reservados, de prueba, ficticios o comúnmente inventados
const FAKE_OR_RESERVED_DOMAINS = new Set([
  "123.com",
  "abc.com",
  "asdf.com",
  "correo.com",
  "dominio.com",
  "email.com",
  "example.com",
  "example.net",
  "example.org",
  "fake.com",
  "falso.com",
  "ficticio.com",
  "inventado.com",
  "invalid",
  "localhost",
  "midominio.com",
  "nada.com",
  "noemail.com",
  "none.com",
  "prueba.com",
  "pruebas.com",
  "qwerty.com",
  "sample.com",
  "test.com",
  "testing.com",
  "xyz.com"
]);

// Expresión regular estándar RFC 5322 simplificada y estricta
const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export type EmailValidationResult =
  | { isValid: true; cleanEmail: string; isGmail: boolean; isInstitutional: boolean }
  | { isValid: false; error: string };

export function validateEmail(rawEmail: string): EmailValidationResult {
  const cleanEmail = rawEmail.trim().toLowerCase();

  if (!cleanEmail) {
    return { isValid: false, error: "El correo electronico es obligatorio." };
  }

  if (cleanEmail.length < 6 || cleanEmail.length > 254) {
    return {
      isValid: false,
      error: "La longitud del correo debe estar entre 6 y 254 caracteres."
    };
  }

  if (!EMAIL_REGEX.test(cleanEmail)) {
    return {
      isValid: false,
      error: "El formato del correo electronico no es valido (ejemplo: operador@gmail.com o usuario@uni.edu.pe)."
    };
  }

  const parts = cleanEmail.split("@");
  if (parts.length !== 2) {
    return { isValid: false, error: "El correo electronico debe contener un unico simbolo '@'." };
  }

  const [, domain] = parts;

  // Si es Gmail o Googlemail, se valida y acepta de inmediato
  const isGmail = domain === "gmail.com" || domain === "googlemail.com";
  if (isGmail) {
    return {
      isValid: true,
      cleanEmail,
      isGmail: true,
      isInstitutional: false
    };
  }

  // Si es otro proveedor publico confiable (Outlook, Hotmail, Yahoo, Proton, iCloud)
  if (TRUSTED_DOMAINS.has(domain)) {
    return {
      isValid: true,
      cleanEmail,
      isGmail: false,
      isInstitutional: false
    };
  }

  // Comprobar dominios desechables o temporales
  if (DISPOSABLE_DOMAINS.has(domain)) {
    return {
      isValid: false,
      error: "No se permiten servicios de correo temporal o desechable. Utilice su cuenta de Gmail o correo institucional."
    };
  }

  // Comprobar dominios falsos o de prueba
  if (FAKE_OR_RESERVED_DOMAINS.has(domain)) {
    return {
      isValid: false,
      error: "No se permiten correos con dominios de prueba o ficticios. Ingrese una cuenta real de Gmail o institucional."
    };
  }

  // Validacion de estructura de dominio para dominios corporativos o universitarios
  const domainParts = domain.split(".");
  if (domainParts.length < 2) {
    return {
      isValid: false,
      error: "El dominio del correo debe incluir una extension valida (ejemplo: .com, .edu, .pe)."
    };
  }

  const tld = domainParts[domainParts.length - 1];
  if (tld.length < 2 || !/^[a-z]+$/.test(tld)) {
    return {
      isValid: false,
      error: "La extension de dominio no es valida."
    };
  }

  // Identificar si es un correo institucional (.edu, .edu.pe, .gob.pe, etc.)
  const isInstitutional =
    domain.endsWith(".edu") ||
    domain.endsWith(".edu.pe") ||
    domain.endsWith(".gob.pe") ||
    domain.includes(".uni.edu.pe");

  return {
    isValid: true,
    cleanEmail,
    isGmail: false,
    isInstitutional
  };
}
