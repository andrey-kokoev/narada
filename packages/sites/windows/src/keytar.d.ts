declare module "keytar" {
  export interface Credential {
    account: string;
    password: string;
  }

  export function getPassword(service: string, account: string): Promise<string | null>;
  export function setPassword(service: string, account: string, password: string): Promise<void>;
  export function deletePassword(service: string, account: string): Promise<boolean>;
  export function findCredentials(service: string): Promise<Credential[]>;
}
