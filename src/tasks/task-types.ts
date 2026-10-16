export type ItemAmount =
{
    itemId: string;
    amount: number | null;
};



export type ParameterValue = string | number | boolean | string[] | ItemAmount[];

export type ParameterValues = Record<string, ParameterValue>;



export type ParameterBase =
{
    id:          string;
    label:       string;
    description: string | undefined;
    required:    boolean;
    emptyMeans:  string | undefined;
};



export type TextParameter = ParameterBase &
{
    type:    "text";
    default: string | undefined;
};



export type NumberParameter = ParameterBase &
{
    type:    "number";
    integer: boolean;
    min:     number | undefined;
    max:     number | undefined;
    default: number | undefined;
};



export type BooleanParameter = ParameterBase &
{
    type:    "boolean";
    default: boolean;
};



export type ChoiceOption =
{
    value: string;
    label: string;
};



export type ChoiceParameter = ParameterBase &
{
    type:    "choice";
    options: ChoiceOption[];
    default: string | undefined;
};



export type ItemParameter = ParameterBase &
{
    type:    "item";
    filter:  string | undefined;
    default: string | undefined;
};



export type ItemsParameter = ParameterBase &
{
    type:    "items";
    filter:  string | undefined;
    default: string[] | undefined;
};



export type ItemAmountsParameter = ParameterBase &
{
    type:    "itemAmounts";
    filter:  string | undefined;
    default: undefined;
};



export type TaskParameter =
    | TextParameter
    | NumberParameter
    | BooleanParameter
    | ChoiceParameter
    | ItemParameter
    | ItemsParameter
    | ItemAmountsParameter;



export type CapabilityDefinition =
{
    id:          string;
    label:       string;
    description: string;
};



export type TaskDefinition =
{
    id:          string;
    name:        string;
    description: string;
    requires:    string[];
    parameters:  TaskParameter[];
};



export type ItemDefinition =
{
    id:          string;
    name:        string;
    tags:        string[];
    stackSize:   number;
    burnSeconds: number | undefined;
};



export type GameDefinition =
{
    id:           string;
    name:         string;
    capabilities: CapabilityDefinition[];
    items:        ItemDefinition[];
    digits:       Record<string, string[]> | null;
    tasks:        TaskDefinition[];
};



export type GameManifest =
{
    id:           string;
    name:         string;
    capabilities: CapabilityDefinition[];
};



export type SimulationScenario =
{
    id:    string;
    label: string;
};



export type ReportNote =
{
    level:   "info" | "warning";
    message: string;
};



export type SimulationStep =
{
    title: string;
    lines: string[];
};



export type SimulationReport =
{
    headline: string;
    stats:    { label: string; value: string }[];
    steps:    SimulationStep[];
    notes:    ReportNote[];
};



export type ParseResult<T> =
{
    value:  T | null;
    errors: string[];
};



export type LoadResult =
{
    games:  GameDefinition[];
    errors: string[];
};



export type ItemCatalog =
{
    isAllowed(filter: string | undefined, itemId: string): boolean;
};



export type ParameterError =
{
    parameterId: string | null;
    message:     string;
};



export type ResolveResult =
    | { ok: true;  values: ParameterValues }
    | { ok: false; errors: ParameterError[] };
