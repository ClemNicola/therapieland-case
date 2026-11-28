import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { ApiError } from '../../api/client'
import {
  getListPatientsQueryKey,
  useCreatePatient,
  useUpdatePatient,
} from '../../api/generated/endpoints'
import { Dialog } from '../../components/Dialog'
import { TextField } from '../../components/TextField'
import { fullName, GENDER_LABELS, type PatientRow } from '../../lib/patientFhir'
import {
  EMPTY_PATIENT_FORM,
  formToResource,
  issuesToFormErrors,
  patientFormSchema,
  rowToForm,
  todayIso,
  type PatientField,
  type PatientFormData,
  type PatientFormValues,
} from '../../lib/patientForm'

/** Add a patient (no `patient`) or edit one. `onDone` closes the dialog with a message. */
export function PatientFormDialog({
  patient,
  onClose,
  onDone,
  onGone,
}: {
  patient?: PatientRow
  onClose: () => void
  onDone: (message: string) => void
  onGone: () => void // 404: archived or unfollowed elsewhere
}) {
  const queryClient = useQueryClient()
  const create = useCreatePatient()
  const update = useUpdatePatient()
  const [formErrors, setFormErrors] = useState<string[]>([])
  const [today] = useState(todayIso) // read once: render stays pure
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PatientFormValues, unknown, PatientFormData>({
    resolver: zodResolver(patientFormSchema),
    defaultValues: patient ? rowToForm(patient) : EMPTY_PATIENT_FORM,
  })
  const refreshList = () => queryClient.invalidateQueries({ queryKey: getListPatientsQueryKey() })

  const save = handleSubmit(async (data) => {
    setFormErrors([])
    const resource = formToResource(data)
    try {
      if (patient) await update.mutateAsync({ id: patient.id, data: resource })
      else await create.mutateAsync({ data: resource })
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        await refreshList() // archived or unfollowed elsewhere
        return onGone()
      }
      if (error instanceof ApiError && error.status === 400) {
        const { fields, form } = issuesToFormErrors(error.body, resource)
        Object.entries(fields).forEach(([field, message], index) =>
          setError(field as PatientField, { message }, { shouldFocus: index === 0 }),
        )
        return setFormErrors(form)
      }
      return setFormErrors(['The patient could not be saved. Try again.'])
    }
    await refreshList()
    onDone(`${fullName(data)} ${patient ? 'updated' : 'added'}.`)
  })

  const title = patient ? `Edit ${fullName(patient)}` : 'Add patient'
  const genderErrorId = 'patient-gender-error'

  return (
    <Dialog title={title} onClose={onClose}>
      <form noValidate onSubmit={save} className="flex flex-col gap-5">
        {formErrors.length > 0 && (
          <div role="alert" className="border-l-4 border-brick bg-white px-4 py-3 text-brick">
            {formErrors.map((message) => (
              <p key={message}>{message}</p>
            ))}
          </div>
        )}
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField id="patient-given" label="Given name" error={errors.given?.message} autoComplete="off" {...register('given')} />
          <TextField id="patient-family" label="Family name" error={errors.family?.message} autoComplete="off" {...register('family')} />
        </div>
        <TextField
          id="patient-birth-date"
          label="Date of birth"
          type="date"
          max={today}
          error={errors.birthDate?.message}
          {...register('birthDate')}
        />
        <fieldset aria-describedby={errors.gender ? genderErrorId : undefined} aria-invalid={errors.gender ? true : undefined}>
          <legend className="font-medium">Gender</legend>
          <div className="mt-2 flex flex-wrap gap-x-5">
            {Object.entries(GENDER_LABELS).map(([value, label]) => (
              <label key={value} className="flex min-h-11 items-center gap-2">
                <input type="radio" value={value} className="size-5 accent-pine" {...register('gender')} />
                {label}
              </label>
            ))}
          </div>
          {errors.gender && (
            <p id={genderErrorId} className="text-sm text-brick">
              {errors.gender.message}
            </p>
          )}
        </fieldset>
        {/* autocomplete off: the browser must not fill in the practitioner's own details. */}
        <TextField
          id="patient-phone"
          label={<>Phone <span className="font-normal text-muted">(optional)</span></>}
          type="tel"
          autoComplete="off"
          error={errors.phone?.message}
          {...register('phone')}
        />
        <TextField
          id="patient-email"
          label={<>Email <span className="font-normal text-muted">(optional)</span></>}
          type="email"
          autoComplete="off"
          error={errors.email?.message}
          {...register('email')}
        />
        <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="min-h-11 rounded-md border border-line bg-white px-5 font-medium hover:border-pine">
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="min-h-11 rounded-md bg-pine px-5 font-semibold text-white hover:bg-pine-dark disabled:opacity-70"
          >
            {patient ? 'Save changes' : 'Add patient'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
