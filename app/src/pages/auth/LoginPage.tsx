import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router";
import type { z } from "zod";
import { ApiError } from "../../api/client";
import { getGetMeQueryKey, useLogin } from "../../api/generated/endpoints";
import { LoginBody } from "../../api/generated/endpoints.zod";

type LoginForm = z.infer<typeof LoginBody>;

// Messages for the generated schema's rules (the schema itself stays as generated).
function fieldMessage(issue: {
  path?: PropertyKey[];
  input?: unknown;
  code?: string;
}) {
  if (issue.path?.[0] === "email") {
    return issue.input
      ? "Enter a valid email address."
      : "Enter your email address.";
  }
  return issue.code === "too_big"
    ? "This password is too long."
    : "Enter your password.";
}

function serverMessage(error: unknown) {
  // One generic message: never reveal whether the email has an account.
  if (error instanceof ApiError && error.status === 400)
    return "Invalid email or password.";
  if (error instanceof ApiError && error.status === 429) {
    return "Too many attempts. Wait a minute and try again.";
  }
  return "Something went wrong. Try again.";
}

export function LoginPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    resetField,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(LoginBody, { error: fieldMessage }),
    defaultValues: { email: "", password: "" },
  });
  const login = useLogin({
    mutation: {
      // The login response is the logged-in user: it becomes the /me data, the guard lets in.
      onSuccess: (response) => {
        queryClient.setQueryData(getGetMeQueryKey(), response);
        void navigate("/patients", { replace: true });
      },
      onError: () => resetField("password"),
    },
  });

  return (
    <main className="mx-auto flex min-h-[calc(100svh-4px)] w-full max-w-sm flex-col justify-center px-6 py-12">
      <p className="text-sm font-semibold text-pine">Patient Management</p>
      <h1 className="mt-6 text-4xl font-semibold tracking-tight">Sign in</h1>
      <p className="mt-2 text-muted">Use the account your practice gave you.</p>

      <form
        className="mt-10 flex flex-col gap-6"
        noValidate
        onSubmit={handleSubmit((data: LoginForm) => login.mutate({ data }))}
      >
        {login.isError && (
          <p
            role="alert"
            className="border-l-4 border-brick bg-white px-4 py-3 text-brick"
          >
            {serverMessage(login.error)}
          </p>
        )}

        <Field
          id="email"
          label="Email"
          error={errors.email?.message}
          type="email"
          autoComplete="username"
          inputMode="email"
          {...register("email")}
        />
        <Field
          id="password"
          label="Password"
          error={errors.password?.message}
          type="password"
          autoComplete="current-password"
          {...register("password")}
        />

        <button
          type="submit"
          disabled={login.isPending}
          className="mt-2 min-h-11 rounded-md bg-pine px-5 font-semibold text-white hover:bg-pine-dark disabled:opacity-70"
        >
          {login.isPending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}

// A labelled input with its error linked for screen readers (React 19: `ref` is a prop).
function Field({
  id,
  label,
  error,
  ...input
}: {
  id: string;
  label: string;
  error?: string;
} & React.ComponentProps<"input">) {
  const errorId = `${id}-error`;
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={`min-h-11 w-full rounded-md border bg-white px-3 text-base ${
          error ? "border-brick" : "border-line"
        }`}
        {...input}
      />
      {error && (
        <p id={errorId} className="text-sm text-brick">
          {error}
        </p>
      )}
    </div>
  );
}
