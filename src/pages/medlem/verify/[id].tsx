import { useRouter } from "next/router";
import { useEffect } from "react";
import { api } from "~/utils/api";


export const VerifyPage = () => {
  const { id } = useRouter().query;
  const { mutate: verifyEmail, isLoading, data } = api.user.verifyEmail.useMutation();

  useEffect(() => {
    verifyEmail({ id: id as string});
  }, []);


  return (
    <div className="flex flex-col items-center justify-center gap-6">
      {isLoading && (
        <p className="text-3xl">
        Verifiera email
      </p>
      )}
      {!isLoading && data?.status === 200 && (
        <p className="text-3xl">
          Din mail är verifierad!
        </p>
      )}
    </div>
  )
};

export default VerifyPage;

