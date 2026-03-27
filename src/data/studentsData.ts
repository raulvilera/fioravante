import type { Student } from '../types';

/**
 * Lista oficial e exclusiva de turmas da EE Fioravante Iervolino.
 * Formato canônico: "1ºAno A", "2ºAno B", ... "AEE D TARDE TEA"
 */
export const ALLOWED_CLASSES = [
    '1ºAno A', '1ºAno B', '1ºAno C', '1ºAno D',
    '2ºAno A', '2ºAno B', '2ºAno C',
    '3ºAno A', '3ºAno B', '3ºAno C',
    '4ºAno A', '4ºAno B', '4ºAno C',
    '5ºAno A', '5ºAno B',
    'AEE D TARDE TEA', 'AEE E TARDE TEA', 'AEE F TARDE TEA'
];

/**
 * Banco de dados local de estudantes (Fallback).
 * EE Fioravante Iervolino — Ciclo I (1º ao 5º) e AEE.
 */
export const STUDENTS_DB: Student[] = [];
