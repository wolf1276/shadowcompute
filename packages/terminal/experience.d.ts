export const setupSteps:string[];
export function onboardingState(input?:{connected?:boolean;data?:any;claimReady?:boolean}):{index:number;action:string;label:string;description:string;complete:boolean;done:boolean[]};
export function unlockPresentation(input?:{exists?:boolean;hasPasskey?:boolean;supported?:boolean}):{passkeyFirst:boolean;showPasskey:boolean;passwordOpen:boolean;passwordLabel:string;submitLabel:string;description:string};
export function inferenceExperience(adapter?:string):{compact:boolean;label:string;placeholder:string;note:string;suggestions:{label:string;prompt:string}[]};
export function progressDescription(stage?:string):string;
export function elapsedLabel(startedAt?:number,now?:number):string;
