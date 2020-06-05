const mongoose = require('mongoose');

const ConfigSchema = new mongoose.Schema({
    key: String,
    value: String,
});

mongoose.model('Config', ConfigSchema);