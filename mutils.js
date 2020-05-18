function error(message, code) {
  let e = new Error(message);
  e.code = code;
  return e;
}

async function asyncForEach(array, callback) {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array);
  }
}

function capitalize (s) {
  if (typeof s !== 'string') return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

exports.error = error;
exports.asyncForEach = asyncForEach;
exports.capitalize = capitalize;