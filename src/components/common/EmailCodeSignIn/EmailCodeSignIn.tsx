import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";
import { InputField } from "~/components/atoms/InputField/InputField";
import { Button } from "~/components/ui/button";
import { authClient } from "~/utils/authClient";
import {
  forgetRequestedEmail,
  readRequestedEmail,
  readSignInLink,
  rememberRequestedEmail,
  shouldAutoSubmitCode
} from "~/utils/signInLink";

interface EmailCodeSignInProps {
  intro: string;
  onSignedIn: () => void | Promise<void>;
}

const GENERIC_ERROR = "Något gick fel. Försök igen.";
const CODE_ERROR = "Koden är fel eller har gått ut. Försök igen.";

/**
 * Email step, code step and a passkey button. The link in the login email
 * (`#email=…&kod=…`) is read once, removed from the URL, and submitted.
 */
export const EmailCodeSignIn = ({ intro, onSignedIn }: EmailCodeSignInProps) => {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // A code from a link this browser didn't ask for: the visitor must confirm it.
  const [confirmLink, setConfirmLink] = useState(false);
  const handledLink = useRef(false);
  const onSignedInRef = useRef(onSignedIn);
  useEffect(() => {
    onSignedInRef.current = onSignedIn;
  });

  const verify = async (emailToVerify: string, otp: string) => {
    setBusy(true);
    setError(null);
    const { error: signInError } = await authClient.signIn.emailOtp({
      email: emailToVerify,
      otp
    });
    if (signInError) {
      setBusy(false);
      setError(CODE_ERROR);
      return;
    }
    forgetRequestedEmail();
    await onSignedInRef.current();
    setBusy(false);
  };

  // The link from the email: take the email and code out of the URL, then sign in.
  useEffect(() => {
    if (!router.isReady || handledLink.current) return;
    const link = readSignInLink(window.location.hash);
    if (!link) return;
    handledLink.current = true;
    setEmail(link.email);
    setCode(link.code);
    setStep("code");
    const autoSubmit = shouldAutoSubmitCode(readRequestedEmail(), link.email);
    setConfirmLink(!autoSubmit);
    // Drop the fragment from the address bar and the history entry before submitting
    void router
      .replace(`${window.location.pathname}${window.location.search}`, undefined, {
        shallow: true,
        scroll: false
      })
      .then(() => (autoSubmit ? verify(link.email.trim().toLowerCase(), link.code) : undefined));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady]);

  // Offer saved passkeys in the browser's autofill where it is supported.
  useEffect(() => {
    let cancelled = false;
    const start = async () => {
      if (
        typeof PublicKeyCredential === "undefined" ||
        !(await PublicKeyCredential.isConditionalMediationAvailable?.())
      ) {
        return;
      }
      const result = await authClient.signIn.passkey({ autoFill: true });
      if (!cancelled && result && !result.error) await onSignedInRef.current();
    };
    void start().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const sendCode = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    // Whether the email has an account is never revealed: always continue to the code step.
    const { error: sendError } = await authClient.emailOtp.sendVerificationOtp({
      email: email.trim(),
      type: "sign-in"
    });
    setBusy(false);
    if (sendError?.status === 429) {
      setError("För många försök. Vänta en stund och försök igen.");
      return;
    }
    if (sendError) {
      setError(GENERIC_ERROR);
      return;
    }
    rememberRequestedEmail(email);
    setEmail(email.trim());
    setStep("code");
  };

  const submitCode = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    await verify(email, code.trim());
  };

  const signInWithPasskey = async () => {
    setError(null);
    const result = await authClient.signIn.passkey();
    if (result?.error) {
      setError("Det gick inte att logga in med passkey.");
      return;
    }
    await onSignedIn();
  };

  return (
    <div className="space-y-4">
      <p>{intro}</p>
      {step === "email" ? (
        <form className="space-y-4" onSubmit={sendCode}>
          <InputField
            id="email"
            type="email"
            label="Email"
            placeholder="Email..."
            autoComplete="username webauthn"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button className="w-full" type="submit" disabled={busy}>
            Skicka kod
          </Button>
        </form>
      ) : (
        <form className="space-y-4" onSubmit={submitCode}>
          <p className="text-sm">
            Vi har skickat en kod till {email}. Koden gäller i 10 minuter.
          </p>
          <InputField
            id="code"
            label="Kod"
            placeholder="123456"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <Button className="w-full" type="submit" disabled={busy}>
            {confirmLink ? `Logga in som ${email}` : "Logga in"}
          </Button>
          <Button
            className="w-full"
            type="button"
            variant="ghost"
            onClick={() => {
              setCode("");
              setConfirmLink(false);
              setError(null);
              setStep("email");
            }}
          >
            Använd en annan email
          </Button>
        </form>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      {step === "email" && (
        <Button
          className="w-full"
          type="button"
          variant="outline"
          onClick={signInWithPasskey}
        >
          Logga in med passkey
        </Button>
      )}
    </div>
  );
};

export default EmailCodeSignIn;
