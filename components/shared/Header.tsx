import React from 'react';
import { Theme } from '../../types';
import { SunIcon, MoonIcon } from '../Icons';

export const Header: React.FC<{ title: string; theme: Theme; setTheme: (theme: Theme) => void; }> = ({ title, theme, setTheme }) => (
    <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-foreground-light dark:text-foreground-dark">{title}</h1>
        <div className="flex items-center gap-4">
            <button
                onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                className="p-2 rounded-full bg-card-light dark:bg-card-dark border border-border-light dark:border-border-dark hover:shadow-md transition-shadow"
            >
                {theme === 'light' ? <MoonIcon className="w-6 h-6" /> : <SunIcon className="w-6 h-6" />}
            </button>
        </div>
    </div>
);
