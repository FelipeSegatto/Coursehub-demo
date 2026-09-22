import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { avatarsForGender, resolveAvatarSrc } from "../../data/profileAvatars";
import { updateUserAvatar, uploadProfileAvatar } from "../../services/ProfileService";
import { FormatInfoBalloon } from "../uploads/FileUploadField";
import { validateSelectedFile } from "../../data/fileUploadRules";

function InputField({
  label,
  name,
  value,
  onChange,
  type = "text",
  placeholder,
  required = false,
}) {
  return (
    <div>
      <label
        htmlFor={`edit-profile-${name}`}
        className="mb-2 block text-sm font-medium text-slate-700"
      >
        {label}
      </label>

      <input
        id={`edit-profile-${name}`}
        name={name}
        type={type}
        value={value ?? ""}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        className="min-h-11 w-full rounded-xl border border-slate-200 px-4 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
      />
    </div>
  );
}

function EditProfileForm({
  profile,
  onSave,
  onCancel,
  isSaving,
  message,
  error,
  onProfileChange,
}) {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    gender: "",
    phone: "",
    address: "",
    specialty: "",
  });

  const [avatarError, setAvatarError] = useState("");
  const [isSavingAvatar, setIsSavingAvatar] = useState(false);

  useEffect(() => {
    setFormData({
      name: profile?.name || "",
      email: profile?.email || "",
      gender: profile?.gender || "",
      phone:
        profile?.details?.phone ||
        profile?.phone ||
        "",
      address:
        profile?.details?.address ||
        profile?.address ||
        "",
      specialty:
        profile?.details?.specialty ||
        profile?.specialty ||
        "",
    });
  }, [profile]);

  function handleChange(event) {
    const { name, value } = event.target;

    setFormData((currentFormData) => ({
      ...currentFormData,
      [name]: value,
    }));
  }

  async function handleSelectCatalogAvatar(avatarKey) {
    try {
      setAvatarError("");
      setIsSavingAvatar(true);
      const response = await updateUserAvatar({ avatarKey });
      onProfileChange?.(response.profile);
    } catch (requestError) {
      setAvatarError(requestError.message || "Não foi possível atualizar o avatar.");
    } finally {
      setIsSavingAvatar(false);
    }
  }

  async function handleUploadAvatar(event) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    const validationError = validateSelectedFile(file, "avatar");

    if (validationError) {
      setAvatarError(validationError);
      return;
    }

    try {
      setAvatarError("");
      setIsSavingAvatar(true);
      const response = await uploadProfileAvatar(file);
      onProfileChange?.(response.profile);
    } catch (requestError) {
      setAvatarError(requestError.message || "Não foi possível enviar a foto.");
    } finally {
      setIsSavingAvatar(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    await onSave(formData);
  }

  const catalog = avatarsForGender(formData.gender || profile.gender);
  const currentAvatar = resolveAvatarSrc({
    avatarKey: profile.avatarKey,
    gender: formData.gender || profile.gender,
    avatarFileId: profile.avatarFileId,
  });

  return (
    <form onSubmit={handleSubmit}>
      <div className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-sm font-medium text-slate-700">Foto de perfil</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <img
            src={currentAvatar.src}
            alt={currentAvatar.alt}
            className="h-16 w-16 rounded-full object-cover"
            loading="lazy"
            decoding="async"
          />
          <label className="cursor-pointer rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Enviar foto
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              disabled={isSavingAvatar || isSaving}
              onChange={handleUploadAvatar}
            />
          </label>
          <FormatInfoBalloon purpose="avatar" />
        </div>
        <p className="mt-4 text-xs text-slate-500">Ou escolha um avatar do catálogo, separado por gênero:</p>
        <div className="mt-3 flex flex-wrap gap-3">
          {catalog.map((avatar) => (
            <button
              key={avatar.key}
              type="button"
              disabled={isSavingAvatar || isSaving}
              onClick={() => handleSelectCatalogAvatar(avatar.key)}
              className={`rounded-full ring-2 ring-offset-2 transition ${
                !profile.avatarFileId && profile.avatarKey === avatar.key
                  ? "ring-blue-600"
                  : "ring-transparent hover:ring-slate-300"
              }`}
            >
              <img src={avatar.src} alt={avatar.alt} className="h-12 w-12 rounded-full object-cover" loading="lazy" decoding="async" />
            </button>
          ))}
        </div>
        {avatarError && <p className="mt-3 text-sm text-red-600">{avatarError}</p>}
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <InputField
          label="Nome completo"
          name="name"
          value={formData.name}
          onChange={handleChange}
          required
        />

        <InputField
          label="E-mail"
          name="email"
          type="email"
          value={formData.email}
          onChange={handleChange}
          required
        />

        {profile.role !== "admin" && (
          <InputField
            label="Telefone"
            name="phone"
            value={formData.phone}
            onChange={handleChange}
            placeholder="(00) 00000-0000"
          />
        )}

        <div>
          <label
            htmlFor="edit-profile-gender"
            className="mb-2 block text-sm font-medium text-slate-700"
          >
            Gênero
          </label>

          <select
            id="edit-profile-gender"
            name="gender"
            value={formData.gender}
            onChange={handleChange}
            className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          >
            <option value="">Prefiro não informar</option>
            <option value="male">Masculino</option>
            <option value="female">Feminino</option>
            <option value="non_binary">Não binário</option>
            <option value="other">Outro</option>
          </select>
        </div>

        {profile.role === "student" && (
          <div className="md:col-span-2">
            <InputField
              label="Endereço"
              name="address"
              value={formData.address}
              onChange={handleChange}
              placeholder="Informe seu endereço"
            />
          </div>
        )}

        {profile.role === "teacher" && (
          <InputField
            label="Especialidade"
            name="specialty"
            value={formData.specialty}
            onChange={handleChange}
            placeholder="Ex.: Língua Inglesa"
          />
        )}
      </div>

      {message && (
        <p
          role="status"
          className="mt-6 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
        >
          {message}
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSaving}
          className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Cancelar
        </button>

        <button
          type="submit"
          disabled={isSaving}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Save size={17} />

          {isSaving ? "Salvando..." : "Salvar alterações"}
        </button>
      </div>
    </form>
  );
}

export default EditProfileForm;