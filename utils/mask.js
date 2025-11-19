export function maskEmail(email) {
  if (!email || !email.includes("@")) return "Hidden by user";
  const [local, domain] = email.split("@");
  return `${local[0]}*******@${domain}`;
}

export function maskUserRow(user) {
  if (!user.is_hidden) return user;

  return {
    ...user,
    username: "Hidden by user",
    email: maskEmail(user.email),
    first_name: "Hidden by user",
    last_name: "Hidden by user",
    mobile_number: "Hidden by user",
  };
}
