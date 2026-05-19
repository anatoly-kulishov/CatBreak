const { Notification } = require("electron");

function isSupported() {
  return Notification.isSupported();
}

function showNotification({ title, body, silent = true }) {
  if (!isSupported()) {
    return false;
  }

  const notification = new Notification({
    title,
    body,
    silent,
  });
  notification.show();
  return true;
}

module.exports = {
  isSupported,
  showNotification,
};
