import { Separator } from "@/components/ui/separator"
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"
import {
    Tabs,
    TabsList,
    TabsTrigger
} from "@/components/ui/tabs"

export function Market() {
    return (
        <div className="flex min-h-svh w-full justify-center p-6 md:p-10" >
            <div className="w-full max-w-md">


                <Card className="m-5 gap-0">
                <div className="flex items-center justify-between px-5 pt-2 pb-[10px] shrink-0">
                    <div className="logo-text">ANVX
                        <span>sim</span>
                    </div>
                </div>                    
                    <CardContent>
                        <Card className="port-card">
                            <CardHeader>
                                <CardTitle className="port-label">
                                    Стоимость портфеля
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="port-total">₽ 408 380</div>
                                <div className="port-pnl">
                                    <span className="pnl-badge dn">-91&nbsp;620 ₽</span>
                                    <span className="pnl-badge up">-91&nbsp;620 ₽</span>
                                </div>
                                <Separator className="pd-2 m-2  " />
                            </CardContent>
                        </Card>
                        <div className="m-5 sec-title">Рынок</div>
                        <Tabs defaultValue="all" className="w-[400px] m-5">
                            <TabsList>
                                <TabsTrigger value="all">Все</TabsTrigger>
                                <TabsTrigger value="shares">Акции</TabsTrigger>
                                <TabsTrigger value="bonds">Облигации</TabsTrigger>
                                <TabsTrigger value="etf">ETF</TabsTrigger>
                            </TabsList>
                        </Tabs>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}