function error(message, code) {
  let e = new Error(message);
  e.code = code;
  return e;
}

exports.error = error;