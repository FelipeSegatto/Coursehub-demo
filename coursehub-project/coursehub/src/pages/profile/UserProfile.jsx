import { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { useNavigate } from "react-router-dom";

import EditProfileModal from "../../components/profile/EditProfileModal";
import ProfileHeaderCard from "../../components/profile/ProfileHeaderCard";
import ProfileInformationCard from "../../components/profile/ProfileInformationCard";

import { useAuth } from "../../auth/AuthContext";

import {
  getUserProfile,
  updateUserProfile,
} from "../../services/ProfileService";

export default function UserProfile() {
  const navigate = useNavigate();

  const {
    usuarioLogado,
    atualizarUsuarioLogado,
    loading: authLoading,
  } = useAuth();

  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState("");

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [profileError, setProfileError] = useState("");

  useEffect(() => {
    /*
      Espera o AuthContext terminar de verificar
      se existe um usuário autenticado.
    */
    if (authLoading) {
      return;
    }

    /*
      Se não existe usuário autenticado,
      interrompe o carregamento.
    */
    if (!usuarioLogado?.id) {
      setProfile(null);

      setPageError(
        "Não foi possível identificar o usuário autenticado."
      );

      setIsLoading(false);

      return;
    }

    let componentIsMounted = true;

    async function loadProfile() {
      try {
        setIsLoading(true);
        setPageError("");

        const response = await getUserProfile();

        if (!componentIsMounted) {
          return;
        }

        /*
          O backend retorna:

          {
            profile: {
              id,
              name,
              email,
              gender,
              role,
              status,
              avatarKey,
              phone,
              address,
              specialty
            }
          }
        */
        const receivedProfile = response?.profile;

        if (
          !receivedProfile ||
          typeof receivedProfile !== "object"
        ) {
          throw new Error(
            "O backend não retornou um perfil válido."
          );
        }

        /*
          Todos os campos ficam diretamente dentro
          do objeto profile.

          Não existe profile.details.
        */
        setProfile({
          id:
            receivedProfile.id ??
            usuarioLogado.id,

          name:
            receivedProfile.name ??
            "",

          email:
            receivedProfile.email ??
            "",

          gender:
            receivedProfile.gender ??
            "",

          role:
            receivedProfile.role ??
            usuarioLogado.role ??
            "",

          status:
            receivedProfile.status ??
            "",

        avatarKey:
          receivedProfile.avatarKey ??
          receivedProfile.avatar_key ??
          null,

        avatarFileId:
          receivedProfile.avatarFileId ??
          receivedProfile.avatar_file_id ??
          null,

          phone:
            receivedProfile.phone ??
            "",

          address:
            receivedProfile.address ??
            "",

          specialty:
            receivedProfile.specialty ??
            "",
        });
      } catch (error) {
        console.error(
          "Erro ao carregar perfil:",
          error
        );

        if (componentIsMounted) {
          setProfile(null);

          setPageError(
            error?.message ||
              "Erro ao carregar perfil."
          );
        }
        
      } finally {
        if (componentIsMounted) {
          setIsLoading(false);
        }
      }
    }

    loadProfile();

    return () => {
      componentIsMounted = false;
    };
  }, [
    authLoading,
    usuarioLogado?.id,
    usuarioLogado?.role,
  ]);

  function handleOpenEditModal() {
    setProfileMessage("");
    setProfileError("");
    setIsEditModalOpen(true);
  }

  function handleCloseEditModal() {
    /*
      Impede o fechamento enquanto
      os dados estão sendo enviados.
    */
    if (isSavingProfile) {
      return;
    }

    setIsEditModalOpen(false);
    setProfileMessage("");
    setProfileError("");
  }

  function handleProfileChange(updatedProfile) {
    if (!updatedProfile) return;

    setProfile((current) => ({
      ...current,
      ...updatedProfile,
      avatarKey: updatedProfile.avatarKey ?? updatedProfile.avatar_key ?? current?.avatarKey,
      avatarFileId: updatedProfile.avatarFileId ?? updatedProfile.avatar_file_id ?? null,
    }));

    if (typeof atualizarUsuarioLogado === "function") {
      atualizarUsuarioLogado({
        ...usuarioLogado,
        ...updatedProfile,
        avatarKey: updatedProfile.avatarKey ?? updatedProfile.avatar_key,
        avatarFileId: updatedProfile.avatarFileId ?? updatedProfile.avatar_file_id ?? null,
      });
    }
  }

  async function handleSaveProfile(formData) {
    if (!usuarioLogado?.id) {
      setProfileError(
        "Não foi possível identificar o usuário autenticado."
      );

      return;
    }

    try {
      setIsSavingProfile(true);
      setProfileMessage("");
      setProfileError("");

      const response = await updateUserProfile(formData);

      /*
        O backend retorna:

        {
          message: "...",
          profile: {...}
        }
      */
      const updatedProfile = response?.profile;

      if (!updatedProfile) {
        throw new Error(
          "O backend não retornou o perfil atualizado."
        );
      }

      /*
        Substitui o perfil atual pelo perfil completo
        que voltou do backend.
      */
      setProfile({
        id:
          updatedProfile.id ??
          usuarioLogado.id,

        name:
          updatedProfile.name ??
          "",

        email:
          updatedProfile.email ??
          "",

        gender:
          updatedProfile.gender ??
          "",

        role:
          updatedProfile.role ??
          usuarioLogado.role ??
          "",

        status:
          updatedProfile.status ??
          "",

        avatarKey:
          updatedProfile.avatarKey ??
          updatedProfile.avatar_key ??
          null,

        avatarFileId:
          updatedProfile.avatarFileId ??
          updatedProfile.avatar_file_id ??
          null,

        phone:
          updatedProfile.phone ??
          "",

        address:
          updatedProfile.address ??
          "",

        specialty:
          updatedProfile.specialty ??
          "",
      });

      /*
        Atualiza também os dados do AuthContext,
        caso essa função exista no contexto.
      */
      if (
        typeof atualizarUsuarioLogado === "function"
      ) {
        atualizarUsuarioLogado({
          ...usuarioLogado,

          name:
            updatedProfile.name ??
            usuarioLogado.name,

          email:
            updatedProfile.email ??
            usuarioLogado.email,

          gender:
            updatedProfile.gender ??
            usuarioLogado.gender,

          avatarKey:
            updatedProfile.avatarKey ??
            updatedProfile.avatar_key ??
            usuarioLogado.avatarKey ??
            null,

          avatarFileId:
            updatedProfile.avatarFileId ??
            updatedProfile.avatar_file_id ??
            usuarioLogado.avatarFileId ??
            null,
        });
      }

      setProfileMessage(
        response?.message ||
          "Informações atualizadas com sucesso."
      );

      /*
        Fecha o modal depois de exibir
        a mensagem de sucesso.
      */
      setTimeout(() => {
        setIsEditModalOpen(false);
        setProfileMessage("");
      }, 1000);
    } catch (error) {
      console.error(
        "Erro ao atualizar perfil:",
        error
      );

      setProfileError(
        error?.message ||
          "Não foi possível atualizar as informações."
      );
    } finally {
      setIsSavingProfile(false);
    }
  }

  function handleOpenPasswordPage() {
    /*
      Ajuste esse caminho caso sua rota
      de segurança seja diferente.
    */
    navigate("seguranca");
  }

  if (authLoading || isLoading) {
    return <ProfileLoading />;
  }

  if (pageError || !profile) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="rounded-3xl border border-red-200 bg-red-50 p-6">
            <h1 className="text-lg font-semibold text-red-800">
              Não foi possível carregar o perfil
            </h1>

            <p className="mt-2 text-sm text-red-700">
              {pageError ||
                "Perfil não encontrado."}
            </p>

            <button
              type="button"
              onClick={() =>
                window.location.reload()
              }
              className="mt-5 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700"
            >
              Tentar novamente
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">
            Minha conta
          </p>

          <h1 className="mt-2 text-3xl font-bold text-slate-900">
            Meu perfil
          </h1>

          <p className="mt-2 max-w-2xl text-slate-500">
            Consulte seus dados pessoais e gerencie
            as informações da sua conta.
          </p>
        </header>

        <div className="space-y-6">
          <ProfileHeaderCard
            profile={profile}
          />

          <ProfileInformationCard
            profile={profile}
          />

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={handleOpenEditModal}
              className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              Editar informações
            </button>

            <button
              type="button"
              onClick={handleOpenPasswordPage}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
            >
              <KeyRound size={17} />

              Alterar senha
            </button>
          </div>
        </div>
      </div>

      <EditProfileModal
        isOpen={isEditModalOpen}
        profile={profile}
        onClose={handleCloseEditModal}
        onSave={handleSaveProfile}
        onProfileChange={handleProfileChange}
        isSaving={isSavingProfile}
        message={profileMessage}
        error={profileError}
      />
    </main>
  );
}

function ProfileLoading() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="animate-pulse space-y-6">
          <div className="h-32 rounded-3xl bg-slate-200" />

          <div className="h-96 rounded-3xl bg-slate-200" />

          <div className="h-11 w-72 rounded-xl bg-slate-200" />
        </div>
      </div>
    </main>
  );
}