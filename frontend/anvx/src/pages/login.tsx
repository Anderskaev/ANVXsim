import { NavLink, useNavigate } from "react-router"
import { cn } from "@/lib/utils"
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldError
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useAuthStore } from "@/store/auth.store"
import { useState } from "react"
import { useForm } from "react-hook-form"
import api from '@/lib/axios'
import { Alert, AlertDescription } from "@/components/ui/alert"


const loginSchema = z.object({
  email: z.email('Введите корректный email'),
  password: z.string().min(8, 'Пароль не менее 8 символов'),
})

type LoginForm = z.infer<typeof loginSchema>

export function Login({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [error, setError] = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
    mode: 'onChange'
  })

  const onSubmit = async (values: LoginForm) => {
    setError(null)
    try {

      const { data } = await api.post('/auth/login', values)

      localStorage.setItem('access_token', data.access_token)
      localStorage.setItem('refresh_token', data.refresh_token)

      setAuth(data.user, data.portfolio)
      navigate('/market', { replace: true })

    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Ошибка входа. Попробуйте позже.')
    }
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle>
            Login to your account
          </CardTitle>
          <CardDescription>
            Enter your email and password to continue
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <form onSubmit={handleSubmit(onSubmit)}>
            <FieldGroup className="gap-2">
              <Field>
                <FieldLabel htmlFor="email">E-mail</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  placeholder="my@mail.com"
                  {...register('email')}
                  required
                />
              <FieldError className="min-h-[20px]" ><span>{errors.email?.message}</span></FieldError>                
              </Field>
              <Field>
                <div className="flex items-center">
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                  { // <a href="#" className="ml-auto inline-block text-sm underline-offset-4 hover:underline">
                    //Forgot your password?
                    //</a> 
                  }
                </div>
                <Input
                  id="password"
                  type="password"
                  {...register('password')}
                  required
                />
                <FieldError className="min-h-[20px]" ><span>{errors.password?.message}</span></FieldError>                
              </Field>
              <Field>
                <Button type="submit"> {isSubmitting ? 'Checking...' : 'Login'}</Button>
                <FieldDescription>
                  Don't have account? <NavLink to="/register">Register</NavLink>
                </FieldDescription>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  )

}