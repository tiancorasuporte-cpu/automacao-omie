export const LOGIN_ENTER_KEY = "ancora-login-enter";

export function markLoginEnter() {
  try {
    sessionStorage.setItem(LOGIN_ENTER_KEY, "1");
  } catch {
    // private mode / blocked storage
  }
}

export function consumeLoginEnter() {
  try {
    const value = sessionStorage.getItem(LOGIN_ENTER_KEY);
    if (value) sessionStorage.removeItem(LOGIN_ENTER_KEY);
    return value === "1";
  } catch {
    return false;
  }
}

export function wait(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}
