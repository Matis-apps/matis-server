const crypto = require('crypto');
const jsonwebtoken = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const pathToKey = path.join(__dirname, '.', 'id_rsa_priv.pem');
const PRIV_KEY = fs.readFileSync(pathToKey, 'utf8');

/**
 * -------------- HELPER FUNCTIONS ----------------
 */

/**
 *
 * @param {*} message - The plain text password
 * @param {*} code - The hash stored in the database
 *
 * This function provides a basic template to return HTTP error with a code and a message
 */
function error(message, code) {
  var e = new Error(message);
  e.code = code;
  return {
    code: e.code,
    message: e.message,
  };
}

/**
 *
 * @param {*} array - The plain text password
 * @param {*} callback - The hash stored in the database
 *
 * This function allows to apply a forEach method in a synchronous way
 */
async function asyncForEach(array, callback) {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array);
  }
}

/**
 *
 * @param {*} s - The plain text password
 * @param {*} code - The hash stored in the database
 *
 * This function return the string by putting the first letter in uppercase
 */
function capitalize (string) {
  if (typeof string !== 'string') return '';
  return string.charAt(0).toUpperCase() + string.slice(1);
}

function removeParentheses(string) {
  if (typeof string !== 'string') return '';
  return string.replace(/\([^()]*\)/g, '').trim();
}

/**
 *
 * @param {*} password - The plain text password
 * @param {*} hash - The hash stored in the database
 * @param {*} salt - The salt stored in the database
 *
 * This function uses the crypto library to decrypt the hash using the salt and then compares
 * the decrypted hash/salt with the password that the user provided at login
 */
function validPassword(password, hash, salt) {
    var hashVerify = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    return hash === hashVerify;
}

/**
 *
 * @param {*} password - The password string that the user inputs to the password field in the register form
 *
 * This function takes a plain text password and creates a salt and hash out of it.  Instead of storing the plaintext
 * password in the database, the salt and hash are stored for security
 *
 * ALTERNATIVE: It would also be acceptable to just use a hashing algorithm to make a hash of the plain text password.
 * You would then store the hashed password in the database and then re-hash it to verify later (similar to what we do here)
 */
function genPassword(password) {
    var salt = crypto.randomBytes(32).toString('hex');
    var genHash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');

    return {
      salt: salt,
      hash: genHash
    };
}


/**
 * @param {*} user - The user object.
 * We need this to set the JWT `sub` payload property to the MongoDB user ID
 */
 function issueJWT(user, expires) {
  const payload = {
    sub: user._id,
    iat: Math.floor(Date.now() / 1000),
  };

  return {
    token: jsonwebtoken.sign(payload, PRIV_KEY, { algorithm: 'RS256', expiresIn: expires }),
    expires: expires,
  };
}

function issueJWTAccessToken(user) {
  return issueJWT(user, 60 * 15);
}

function issueJWTRefreshToken(user) {
  return issueJWT(user, 60 * 15 * 24 * 14);
}


function checkSize(one, two, accepted_diff = 200) {
  if (typeof one !== 'string') return 0;
  if (typeof two !== 'string') return 0;

  var diff = Math.abs(two.length - one.length) / one.length * 100;
  return diff < accepted_diff;
}

function isSameUPC(upc1, upc2) {
  if (upc1 == null || upc2 == null) return false;

  const regex = new RegExp('^0+');
  var shortI1 = upc1.replace(regex,'');
  var shortI2 = upc2.replace(regex,'');

  const minSize = Math.min(shortI1.length, shortI2.length);

  return (upc1 == upc2)
      || (shortI1 == upc2 || upc1 == shortI2 || shortI1 == shortI2)
      || (shortI1.substring(0,minSize) == upc2.substring(0,minSize) || upc1.substring(0,minSize) == shortI2.substring(0,minSize) || shortI1.substring(0,minSize) == shortI2.substring(0,minSize));
}

exports.error = error;
exports.asyncForEach = asyncForEach;
exports.capitalize = capitalize;
exports.removeParentheses = removeParentheses;
exports.validPassword = validPassword;
exports.genPassword = genPassword;
exports.issueJWTAccessToken = issueJWTAccessToken;
exports.issueJWTRefreshToken = issueJWTRefreshToken;
exports.checkSize = checkSize;
exports.isSameUPC = isSameUPC;
