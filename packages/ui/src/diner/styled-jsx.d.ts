import "react";

// `<style jsx>` lo compila styled-jsx dentro de Next (las apps transpilan este paquete); solo hace falta el tipo.
declare module "react" {
  interface StyleHTMLAttributes<T> extends HTMLAttributes<T> {
    jsx?: boolean;
    global?: boolean;
  }
}
