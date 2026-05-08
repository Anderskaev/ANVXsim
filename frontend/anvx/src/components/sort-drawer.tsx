// src/components/market/SortDrawer.tsx

import { useState } from 'react'
import { useUiStore } from '@/store/ui.store'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
    Drawer,
    DrawerContent,
    DrawerDescription,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle,
    DrawerTrigger,
    DrawerPortal
} from '@/components/ui/drawer'
import type { SortColumn } from '@/store/ui.store'

const SORT_OPTIONS = [
    { value: 'ticker' as SortColumn, label: 'Тикер' },
    { value: 'price' as SortColumn, label: 'Цена' },
    { value: 'change_pct' as SortColumn, label: 'Изменение %' },
    { value: 'volume' as SortColumn, label: 'Объём' },
]

export function SortDrawer() {
    const { marketSort } = useUiStore()
    const { setMarketSort, resetMarketSort } = useUiStore()

    const [localCol, setLocalCol] = useState(marketSort.col)
    const [localDir, setLocalDir] = useState<'asc' | 'desc'>(marketSort.dir)
    const [open, setOpen] = useState(false)

    const isActive = marketSort.col !== 'ticker' || marketSort.dir !== 'asc'

    const handleOpen = (val: boolean) => {
        if (val) {
            setLocalCol(marketSort.col)
            setLocalDir(marketSort.dir)
        }
        setOpen(val)
    }

    const handleApply = () => {
        setMarketSort(localCol, localDir)
        setOpen(false)
    }

    const handleReset = () => {
        resetMarketSort()
        setLocalCol('ticker')
        setLocalDir('asc')
        setOpen(false)
    }

    return (
        <Drawer open={open} onOpenChange={handleOpen}>
            <DrawerTrigger asChild>
                <Button
                    variant={isActive ? 'default' : 'outline'}
                    size="sm"
                    className="gap-2"
                >
                    <span>↕</span>
                    <span>Сортировка</span>
                    {isActive && (
                        <span className="bg-primary-foreground text-primary rounded-full w-4 h-4 text-xs flex items-center justify-center font-bold">
                            1
                        </span>
                    )}
                </Button>
            </DrawerTrigger>
            <DrawerPortal>
            <DrawerContent>
                <DrawerHeader className="flex items-center justify-between">
                    <DrawerTitle>Сортировка</DrawerTitle>
                    {/* fixes Missing Description warning */}
                    <DrawerDescription className="sr-only">
                        Выберите поле и направление сортировки
                    </DrawerDescription>
     
                </DrawerHeader>

                <div className="px-4 space-y-6 pb-2">

                    {/* поле — кнопки вместо Select */}
                    <div className="space-y-2">
                        <Label className="text-sm font-medium">Поле</Label>
                        <div className="grid grid-cols-2 gap-2">
                            {SORT_OPTIONS.map((opt) => (
                                <button
                                    key={opt.value}
                                    onClick={() => setLocalCol(opt.value)}
                                    className={`px-3 py-2 rounded-md text-sm font-medium border transition-colors text-left ${localCol === opt.value
                                            ? 'border-primary bg-primary/10 text-primary'
                                            : 'border-border text-muted-foreground hover:border-foreground hover:text-foreground'
                                        }`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* направление */}
                    <div className="space-y-2">
                        <Label className="text-sm font-medium">Направление</Label>
                        <RadioGroup
                            value={localDir}
                            onValueChange={(v) => setLocalDir(v as 'asc' | 'desc')}
                            className="grid grid-cols-2 gap-2"
                        >
                            <Label
                                htmlFor="dir-asc"
                                className={`flex items-center gap-2 border rounded-md px-3 py-2 cursor-pointer transition-colors ${localDir === 'asc' ? 'border-primary bg-primary/5' : 'border-border'
                                    }`}
                            >
                                <RadioGroupItem value="asc" id="dir-asc" />
                                <span className="text-sm">↑ По возрастанию</span>
                            </Label>
                            <Label
                                htmlFor="dir-desc"
                                className={`flex items-center gap-2 border rounded-md px-3 py-2 cursor-pointer transition-colors ${localDir === 'desc' ? 'border-primary bg-primary/5' : 'border-border'
                                    }`}
                            >
                                <RadioGroupItem value="desc" id="dir-desc" />
                                <span className="text-sm">↓ По убыванию</span>
                            </Label>
                        </RadioGroup>
                    </div>

                </div>

                <DrawerFooter className="gap-2">
                    <Button onClick={handleApply} className="w-full">Применить</Button>
                    <Button variant="outline" className="w-full" onClick={handleReset}>Сбросить</Button>
                </DrawerFooter>

            </DrawerContent>
            </DrawerPortal>
        </Drawer>
    )
}