import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'

import { NavLink, useNavigate } from "react-router"
import { Button } from "@/components/ui/button"
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"
import {
    Field,
    FieldDescription,
    FieldError,
    FieldGroup,
    FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
    Combobox,
    ComboboxContent,
    ComboboxEmpty,
    ComboboxInput,
    ComboboxItem,
    ComboboxList,
} from "@/components/ui/combobox"
import { useForm } from 'react-hook-form'
import { useAuthStore } from '@/store/auth.store'
import { useState } from 'react'
import api from '@/lib/axios'
import { Alert, AlertDescription } from '@/components/ui/alert'

const initial_cash = [50000, 100000, 500000]

const registerSchema = z.object({
    name: z.string().min(1, 'Введите имя'),
    email: z.email('Введите корректный email'),
    password: z.string().min(8, 'Пароль не менее 8 символов'),
    initial_cash: z.number().refine((value) => initial_cash.includes(value), {
        message: 'Выберите начальный капитал из списка'
    }),
    confirm_password: z.string()
}).refine((data) => data.password === data.confirm_password, {
    message: 'Пароли не совпадают',
    path: ["confirm_password"]
})

type RegisterForm = z.infer<typeof registerSchema>


export function Register({
    className,
    ...props
}: React.ComponentProps<"div">) {

    const navigate = useNavigate()
    const setAuth = useAuthStore((s) => s.setAuth)
    const [error, setError] = useState<string | null>(null)

    const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<RegisterForm>({
        resolver: zodResolver(registerSchema),
        defaultValues: { name: '', email: '', password: '', initial_cash: 100000 },
        mode: 'onChange'
    })

    const onSubmit = async (values: RegisterForm) => {
        setError(null)
        try {
            const { data } = await api.post('/auth/register', values)

            localStorage.setItem('access_token', data.access_token)
            localStorage.setItem('refresh_token', data.refresh_token)

            setAuth(data.user, data.portfolio)
            navigate('/market', { replace: true })
        }
        catch (err: any) {
            setError(err.response?.data?.error ?? 'Ошибка регистрации. Попробуйте позже.')
        }
    }

    return (
        <Card {...props}>
            <CardHeader>
                <CardTitle>Create an account</CardTitle>
                <CardDescription>
                    Enter your information below to create your account
                </CardDescription>
            </CardHeader>
            <CardContent className='gap-1'>
                {error && (
                    <Alert variant="destructive" className="mb-4">
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}
                <form onSubmit={handleSubmit(onSubmit)}>
                    <FieldGroup className="gap-2">
                        <Field className='gap-1'>
                            <FieldLabel htmlFor="name">Name</FieldLabel>
                            <Input
                                id="name"
                                type="text"
                                placeholder="John"
                                required
                                {...register('name')}
                            />
                            <FieldError className="min-h-[20px]"><span className='text-[12px]'>{errors.name?.message}</span></FieldError>
                        </Field>
                        <Field className='gap-1'>
                            <FieldLabel htmlFor="email">Email</FieldLabel>
                            <Input
                                id="email"
                                type="email"
                                placeholder="my@mail.com"
                                required
                                {...register('email')}
                            />
                            {/* <FieldDescription>
                                We&apos;ll use this to contact you. We will not share your email
                                with anyone else.
                            </FieldDescription> */}
                            <FieldError className="min-h-[20px]" ><span className='text-[12px]'>{errors.email?.message}</span></FieldError>
                        </Field>
                        <Field className='gap-1'>
                            <FieldLabel htmlFor="cash">Initial cash</FieldLabel>
                            <Combobox
                                id="cash"
                                defaultValue={Number(100000).toLocaleString('ru-RU')}
                                items={initial_cash}
                                {...register('initial_cash')}
                            >
                                <ComboboxInput />
                                <ComboboxEmpty>No items found.</ComboboxEmpty>
                                <ComboboxContent>
                                    <ComboboxList>
                                        {(item) => (
                                            <ComboboxItem key={item} value={item.toLocaleString('ru-RU')}>
                                                {item.toLocaleString('ru-RU')}
                                            </ComboboxItem>
                                        )}
                                    </ComboboxList>
                                </ComboboxContent>
                            </Combobox>
                            <FieldDescription>
                                Select initial ammout of virtual money. You can add extra deposit later
                            </FieldDescription>
                            <FieldError className="min-h-[20px]" ><span className='text-[12px]'>{errors.initial_cash?.message}</span></FieldError>
                        </Field>
                        <Field className='gap-1'>
                            <FieldLabel htmlFor="password">Password</FieldLabel>
                            <Input
                                id="password"
                                type="password"
                                required
                                {...register('password')}
                            />
                            {/* <FieldDescription>
                                Must be at least 8 characters long.
                            </FieldDescription> */}
                            <FieldError className="min-h-[20px]" ><span className='text-[12px]'>{errors.password?.message}</span></FieldError>
                        </Field>
                        <Field className='gap-1'>
                            <FieldLabel htmlFor="confirm-password">
                                Confirm Password
                            </FieldLabel>
                            <Input id="confirm-password" type="password" required {...register('confirm_password')} />
                            <FieldError className="min-h-[20px]" ><span className='text-[12px]'>{errors.confirm_password?.message}</span></FieldError>
                            {/* <FieldDescription>Please confirm your password.</FieldDescription> */}
                        </Field>


                        <FieldGroup>
                            <Field>
                                <Button type="submit">{isSubmitting ? 'Creating...' : 'Create Account'}</Button>
                                <FieldDescription className="px-6 text-center">
                                    Already have an account? <NavLink to="/login">Login</NavLink>
                                </FieldDescription>
                            </Field>
                        </FieldGroup>
                    </FieldGroup>
                </form>
            </CardContent>
        </Card>
    )
}
